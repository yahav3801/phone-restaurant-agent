const logger = require('../utils/logger');
const { generateEmbedding, dotProduct } = require('../utils/embeddings');
const KnowledgeBase = require('../models/KnowledgeBase');
const Restaurant = require('../models/Restaurant');

/**
 * RAG Search Service
 *
 * Performs vector similarity search on knowledge base (menu + restaurant info)
 * Uses OpenAI text-embedding-3-small (1536 dimensions)
 *
 * Search Process:
 * 1. Generate embedding for user query
 * 2. Fetch knowledge base items for restaurant (menu and/or info)
 * 3. Calculate cosine similarity with each item
 * 4. Return top N most similar items
 */

class RAGSearch {
  constructor() {
    this.defaultTopK = 5;
    this.minSimilarityScore = 0.25;  // Lower threshold to catch more matches (was 0.4)

    // Check if Atlas Vector Search is enabled
    this.useAtlasVectorSearch = process.env.USE_ATLAS_VECTOR_SEARCH === 'true';

    logger.info('RAGSearch initialized', {
      mode: this.useAtlasVectorSearch ? 'Atlas Vector Search' : 'Client-Side Search',
      defaultTopK: this.defaultTopK,
      minSimilarityScore: this.minSimilarityScore
    });
  }

  /**
   * Search knowledge base (routes to Atlas or client-side based on config)
   * Automatic fallback to client-side if Atlas fails
   */
  async search(query, restaurantId, options = {}) {
    if (this.useAtlasVectorSearch) {
      try {
        logger.debug('Using Atlas Vector Search');
        return await this.searchWithAtlasVectorSearch(query, restaurantId, options);
      } catch (error) {
        logger.warn('Atlas Vector Search failed, falling back to client-side', {
          error: error.message,
          code: error.code
        });

        // Automatic fallback to client-side search
        return await this.searchClientSide(query, restaurantId, options);
      }
    } else {
      logger.debug('Using client-side search');
      return await this.searchClientSide(query, restaurantId, options);
    }
  }

  /**
   * Search knowledge base by semantic similarity (client-side)
   * Fetches all items and calculates similarity in-memory
   * Supports searching menu items, restaurant info, or both
   */
  async searchClientSide(query, restaurantId, options = {}) {
    const startTime = Date.now();
    const topK = options.topK || this.defaultTopK;
    const inStockOnly = options.inStockOnly !== false;
    const types = options.types || ['menu', 'info'];  // Search both by default

    logger.info('RAGSearch.search called', {
      query,
      restaurantId,
      topK,
      inStockOnly,
      types
    });

    try {
      // 1. Generate embedding for query
      const queryEmbedding = await generateEmbedding(query);

      // 2. Build filter for MongoDB
      const filter = {
        restaurantId,
        type: { $in: types }
      };

      // Apply inStock filter only for menu items
      if (inStockOnly && types.includes('menu')) {
        filter.$or = [
          { type: 'info' },  // Info items don't have inStock
          { type: 'menu', inStock: true }
        ];
      }

      // 3. Fetch matching knowledge base items with projection (optimized)
      // Only fetch needed fields to reduce data transfer
      const items = await KnowledgeBase.find(filter)
        .select('type name description price category inStock question answer response_guidelines embedding')
        .lean()
        .limit(100); // Limit initial fetch - most restaurants won't have more than 100 menu items

      if (items.length === 0) {
        logger.warn('No knowledge base items found', { restaurantId, types });
        return [];
      }

      // 4. Calculate similarity scores (optimized - combine calculation with formatting)
      const scoredItems = [];
      for (const item of items) {
        const score = dotProduct(item.embedding, queryEmbedding);
        
        // Skip if below threshold early (saves processing)
        if (score < this.minSimilarityScore) continue;

        // Format based on type (inline for better performance)
        const formattedItem = item.type === 'menu' ? {
          type: 'menu',
          name: item.name,
          description: item.description,
          price: item.price,
          category: item.category,
          inStock: item.inStock,
          score
        } : {
          type: 'info',
          category: item.category,
          question: item.question,
          answer: item.answer,
          response_guidelines: item.response_guidelines,
          score
        };

        scoredItems.push(formattedItem);
      }

      // 5. Sort by score (descending) and take top K
      scoredItems.sort((a, b) => b.score - a.score);
      
      const results = scoredItems
        .slice(0, topK)
        .map(({ score, ...item }) => {
          // Validate menu item prices
          if (item.type === 'menu' && (item.price <= 0 || item.price > 500)) {
            logger.warn('Suspicious menu price detected', {
              name: item.name,
              price: item.price,
              relevanceScore: score
            });
          }

          return {
            ...item,
            relevanceScore: score
          };
        });

      const duration = Date.now() - startTime;
      logger.info('RAG search completed', {
        query,
        resultCount: results.length,
        menuCount: results.filter(r => r.type === 'menu').length,
        infoCount: results.filter(r => r.type === 'info').length,
        duration
      });

      return results;

    } catch (error) {
      logger.error('Error in RAG search', {
        error: error.message,
        query,
        restaurantId
      });
      throw error;
    }
  }

  /**
   * Search only menu items (backward compatibility)
   */
  async searchMenu(query, restaurantId, options = {}) {
    return this.search(query, restaurantId, { ...options, types: ['menu'] });
  }

  /**
   * Search only restaurant info
   */
  async searchInfo(query, restaurantId, options = {}) {
    return this.search(query, restaurantId, { ...options, types: ['info'], inStockOnly: false });
  }

  /**
   * Search using MongoDB Atlas Vector Search
   * Requires: Atlas M10+ cluster with vector search index
   * Index name: 'knowledge_base_vector_index'
   */
  async searchWithAtlasVectorSearch(query, restaurantId, options = {}) {
    const startTime = Date.now();
    const topK = options.topK || this.defaultTopK;
    const inStockOnly = options.inStockOnly !== false;
    const types = options.types || ['menu', 'info'];

    logger.info('Atlas Vector Search called', {
      query,
      restaurantId,
      topK,
      types
    });

    try {
      // 1. Generate embedding for query
      const queryEmbedding = await generateEmbedding(query);

      // 2. Build $match filter for post-vectorSearch filtering
      const matchFilter = {
        restaurantId,
        type: { $in: types }
      };

      // Apply inStock filter only for menu items
      if (inStockOnly && types.includes('menu')) {
        matchFilter.$or = [
          { type: 'info' },  // Info items don't have inStock
          { type: 'menu', inStock: true }
        ];
      }

      // 3. Build aggregation pipeline
      const pipeline = [
        // Stage 1: Vector similarity search
        {
          $vectorSearch: {
            index: 'knowledge_base_vector_index',
            path: 'embedding',
            queryVector: queryEmbedding,
            numCandidates: topK * 10,  // Over-fetch for better recall
            limit: topK * 2  // Get 2x for post-filtering
          }
        },

        // Stage 2: Filter by restaurantId and type
        {
          $match: matchFilter
        },

        // Stage 3: Add vector search score
        {
          $addFields: {
            relevanceScore: { $meta: 'vectorSearchScore' }
          }
        },

        // Stage 4: Project needed fields
        {
          $project: {
            _id: 0,
            type: 1,
            // Menu fields
            name: 1,
            description: 1,
            price: 1,
            category: 1,
            inStock: 1,
            // Info fields
            question: 1,
            answer: 1,
            response_guidelines: 1,
            // Score
            relevanceScore: 1
          }
        },

        // Stage 5: Filter by similarity threshold
        {
          $match: {
            relevanceScore: { $gte: this.minSimilarityScore }
          }
        },

        // Stage 6: Limit to topK
        { $limit: topK }
      ];

      // 4. Execute aggregation
      const results = await KnowledgeBase.aggregate(pipeline);

      const duration = Date.now() - startTime;
      logger.info('Atlas Vector Search completed', {
        query,
        resultCount: results.length,
        menuCount: results.filter(r => r.type === 'menu').length,
        infoCount: results.filter(r => r.type === 'info').length,
        duration
      });

      return results;

    } catch (error) {
      logger.error('Atlas Vector Search failed', {
        error: error.message,
        code: error.code,
        query,
        restaurantId
      });

      // Re-throw to trigger fallback in parent search() method
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new RAGSearch();
