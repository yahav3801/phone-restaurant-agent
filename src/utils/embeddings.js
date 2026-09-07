const OpenAI = require('openai');
const logger = require('./logger');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// In-memory cache to avoid repeated API calls
const embeddingCache = new Map();

/**
 * Generate embedding vector for text using OpenAI text-embedding-3-small
 * @param {string} text - Text to embed (Hebrew or English)
 * @returns {Promise<number[]>} - 1536-dimensional embedding vector
 */
async function generateEmbedding(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid text input for embedding generation');
  }

  // Check cache first
  const cacheKey = text.trim().toLowerCase();
  if (embeddingCache.has(cacheKey)) {
    logger.debug(`Embedding cache hit for: ${text.substring(0, 50)}...`);
    return embeddingCache.get(cacheKey);
  }

  try {
    logger.debug(`Generating embedding for: ${text.substring(0, 50)}...`);

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float'
    });

    const embedding = response.data[0].embedding;

    // Validate embedding dimensions
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      throw new Error(`Invalid embedding dimensions: ${embedding?.length}`);
    }

    // Cache the result (limit cache size to 1000 entries)
    if (embeddingCache.size < 1000) {
      embeddingCache.set(cacheKey, embedding);
    } else {
      embeddingCache.clear();
      embeddingCache.set(cacheKey, embedding);
    }

    return embedding;
  } catch (error) {
    logger.error('Error generating embedding:', {
      error: error.message,
      text: text.substring(0, 100)
    });
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Calculate dot product similarity between two embedding vectors
 * @param {number[]} a - First embedding vector
 * @param {number[]} b - Second embedding vector
 * @returns {number} - Similarity score (higher = more similar)
 */
function dotProduct(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    throw new Error('Both inputs must be arrays');
  }

  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

/**
 * Clear embedding cache (useful for testing)
 */
function clearCache() {
  embeddingCache.clear();
  logger.info('Embedding cache cleared');
}

module.exports = {
  generateEmbedding,
  dotProduct,
  clearCache
};
