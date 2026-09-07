const OpenAI = require('openai');
const logger = require('../utils/logger');
const langfuseClient = require('../utils/langfuse');

/**
 * Intent Classifier
 *
 * Uses GPT-4o-mini to classify user intents in Hebrew
 *
 * Supported Intents (7 production intents):
 * - order_taking: Customer ordering from menu
 * - general_info: Restaurant questions (hours, location, etc.)
 * - cart_update: Modify/add/remove items from cart
 * - provide_details: Customer providing personal details (name, address, phone)
 * - confirm_order: Customer ready to confirm and finalize order
 * - cancel_order: Customer wants to cancel order or call
 * - transfer: Customer wants to speak with human agent
 */

// System prompt for intent classification (Hebrew)
const SYSTEM_PROMPT = `אתה מסווג כוונות למערכת הזמנות טלפונית של מסעדה בעברית.

תפקידך לסווג את הכוונה של הלקוח לאחת מ-7 הכוונות הבאות:

1. **order_taking** - לקוח רוצה להזמין פריט מהתפריט
   דוגמאות: "אני רוצה פיצה", "תן לי המבורגר", "אשמח לקבל סלט"

2. **general_info** - שאלות על המסעדה
   דוגמאות: "מה שעות הפתיחה?", "יש לכם גלוטן פרי?", "איפה אתם?"

3. **cart_update** - שינוי/הוספה/הסרה מהסל
   דוגמאות: "תוסיף עוד אחד", "תסיר את הסלט", "שנה ל-2"

4. **provide_details** - מסירת פרטים (שם, כתובת, טלפון)
   דוגמאות: "השם דוד", "הכתובת רחוב הרצל 5", "052-1234567"

5. **confirm_order** - אישור וסיום הזמנה
   דוגמאות: "זה הכל", "אני מאשר", "שלח את זה"

6. **cancel_order** - ביטול הזמנה
   דוגמאות: "אני מבטל", "לא רוצה יותר", "תבטל"

7. **transfer** - העברה לנציג אנושי
   דוגמאות: "תעביר לנציג", "רוצה לדבר עם בן אדם"

**הקשר חשוב:** השתמש במצב הנוכחי ובהיסטוריה לדיוק טוב יותר.

**פורמט תשובה (JSON בלבד):**
{
  "intent": "אחת מ-7 הכוונות",
  "keywords": ["מילות", "מפתח"]
}

חשוב: אם לא בטוח, בחר "general_info"
`;

class IntentClassifier {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Model for classification
    this.model = 'gpt-4o-mini';

    // 7 production intents
    this.intents = [
      'order_taking',
      'general_info',
      'cart_update',
      'provide_details',
      'confirm_order',
      'cancel_order',
      'transfer'
    ];

    // Cache for recent classifications (last 100 messages)
    this.classificationCache = new Map();
    this.maxCacheSize = 100;

    // Keyword patterns for fast-path classification (bypasses LLM)
    this.keywordPatterns = {
      general_info: [
        // Greetings
        /\b(שלום|היי|בוקר טוב|ערב טוב|לילה טוב|מה נשמע|מה המצב)\b/i,
        // Thanks
        /\b(תודה|תודה רבה|תודה לך|בסדר|אוקיי|סבבה)\b/i,
        // Simple confirmations (when not in order confirmation state)
        /\b(כן|נכון|יופי|מצוין)\b/i,
        // Restaurant questions
        /\b(מה שעות|איפה|כתובת|טלפון|מספר|איך מגיעים|מה המחיר|כמה עולה)\b/i,
        /\b(יש לכם|יש|גלוטן|כשר|צמחוני|טבעוני)\b/i
      ],
      confirm_order: [
        // Order confirmations
        /\b(כן|נכון|אוקיי|סבבה|אני מאשר|תשלח|תשלח את זה|זה הכל|סיימנו)\b/i,
        // Payment confirmations
        /\b(אשלם|מזומן|אשלם לשליח|בכרטיס|אשלם בכרטיס)\b/i
      ],
      cancel_order: [
        /\b(ביטול|לא רוצה|לא צריך|תבטל|לא|לא תודה)\b/i
      ],
      transfer: [
        /\b(תעביר|נציג|בן אדם|רוצה לדבר עם|מענה אנושי)\b/i
      ],
      cart_update: [
        /\b(תוסיף|תסיר|תשנה|תעדכן|עוד אחד|פחות אחד|ל-2|ל-3)\b/i,
        /\b(תוסיף|תסיר|תשנה)\s+\d+/i  // "תוסיף 2", "תסיר 1"
      ],
      provide_details: [
        // Phone number patterns
        /\b0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}\b/i,  // Israeli phone format
        /\b\d{10}\b/i,  // 10 digits
        // Address keywords
        /\b(רחוב|שדרות|סמטה|כיכר|בית|מספר)\s+/i,
        // Name patterns (single word after "השם" or similar)
        /\b(השם|קוראים לי|שמי|שם)\s+\w+/i
      ]
    };

    logger.info('IntentClassifier initialized', {
      model: this.model,
      intentCount: this.intents.length,
      fastPathEnabled: true
    });
  }

  /**
   * Fast-path keyword-based classification (bypasses LLM for obvious cases)
   * @param {string} userMessage - The user's message
   * @param {string} currentState - Current conversation state
   * @returns {Object|null} - {intent, keywords} or null if should use LLM
   */
  classifyWithKeywords(userMessage, currentState) {
    const normalized = userMessage.trim().toLowerCase();

    // State-aware heuristics
    if (currentState === 'CONFIRMING_ORDER') {
      // In confirmation state, simple "כן" or "נכון" means confirm_order
      if (/\b(כן|נכון|אוקיי|סבבה|אני מאשר|תשלח)\b/i.test(normalized)) {
        return { intent: 'confirm_order', keywords: [], method: 'keyword' };
      }
    }

    if (currentState === 'COLLECTING_DETAILS') {
      // Phone number detection
      if (/\b0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}\b|\b\d{10}\b/i.test(userMessage)) {
        return { intent: 'provide_details', keywords: ['phone'], method: 'keyword' };
      }
      // Address keywords
      if (/\b(רחוב|שדרות|סמטה|כיכר|בית|מספר)\s+/i.test(userMessage)) {
        return { intent: 'provide_details', keywords: ['address'], method: 'keyword' };
      }
      // Name patterns
      if (/\b(השם|קוראים לי|שמי|שם)\s+\w+/i.test(userMessage)) {
        return { intent: 'provide_details', keywords: ['name'], method: 'keyword' };
      }
    }

    // Check keyword patterns in priority order
    const priority = ['transfer', 'cancel_order', 'cart_update', 'confirm_order', 'provide_details', 'general_info'];
    
    for (const intent of priority) {
      if (this.keywordPatterns[intent]) {
        for (const pattern of this.keywordPatterns[intent]) {
          if (pattern.test(userMessage)) {
            // Special handling: in CONFIRMING_ORDER, confirm_order takes priority
            if (intent === 'general_info' && currentState === 'CONFIRMING_ORDER') {
              if (/\b(כן|נכון|אוקיי|סבבה)\b/i.test(normalized)) {
                continue; // Skip general_info, will be handled by confirm_order
              }
            }
            return { intent, keywords: [], method: 'keyword' };
          }
        }
      }
    }

    // If no keyword match found, return null to use LLM
    return null;
  }

  /**
   * Classify user intent
   *
   * @param {string} userMessage - The user's message to classify
   * @param {string} currentState - Current conversation state
   * @param {Array} lastMessages - Last 3 messages for conversation context
   * @returns {Promise<{intent: string, keywords: string[]}>}
   */
  async classify(userMessage, currentState, lastMessages = []) {
    // Start timing
    console.time('intent-classification');
    const startTime = Date.now();

    try {
      // 1. Validate input
      if (!userMessage || userMessage.trim().length === 0) {
        logger.warn('Empty user message for intent classification');
        console.timeEnd('intent-classification');
        return { intent: 'general_info', keywords: [] };
      }

      // 2. Check cache first
      const cacheKey = `${userMessage.trim().toLowerCase()}:${currentState}`;
      if (this.classificationCache.has(cacheKey)) {
        const cached = this.classificationCache.get(cacheKey);
        const duration = Date.now() - startTime;
        console.timeEnd('intent-classification');
        logger.info('Intent classified (cached)', {
          intent: cached.intent,
          keywordCount: cached.keywords.length,
          duration,
          method: 'cache'
        });
        return cached;
      }

      // 3. Try fast-path keyword classification first
      const keywordResult = this.classifyWithKeywords(userMessage, currentState);
      if (keywordResult) {
        const duration = Date.now() - startTime;
        
        // Cache the result
        this._cacheResult(cacheKey, keywordResult);
        
        console.timeEnd('intent-classification');
        logger.info('Intent classified (keyword)', {
          intent: keywordResult.intent,
          keywordCount: keywordResult.keywords.length,
          duration,
          method: 'keyword'
        });
        return keywordResult;
      }

      // 4. Fallback to LLM for ambiguous cases
      return await this._classifyWithLLM(userMessage, currentState, lastMessages, startTime, cacheKey);

    } catch (error) {
      // Error handling - always return safe default
      console.timeEnd('intent-classification');

      logger.error('Intent classification failed', {
        error: error.message,
        stack: error.stack
      });

      // Return safe fallback
      return {
        intent: 'general_info',
        keywords: []
      };
    }
  }

  /**
   * Classify using LLM (fallback for ambiguous cases)
   * @private
   */
  async _classifyWithLLM(userMessage, currentState, lastMessages, startTime, cacheKey) {
    // Create Langfuse trace
    const trace = langfuseClient.trace({
      name: 'intent-classification',
      metadata: {
        currentState,
        messageLength: userMessage.length,
        historyCount: lastMessages.length,
        method: 'llm'
      }
    });

    // Format conversation history
    let conversationContext = '';
    if (lastMessages && lastMessages.length > 0) {
      conversationContext = lastMessages
        .map(msg => {
          const role = msg.role === 'user' ? 'לקוח' : 'עוזר';
          return `${role}: ${msg.content}`;
        })
        .join('\n');
    }

    // Build user prompt
    const userPrompt = `
מצב נוכחי: ${currentState}

${conversationContext ? `היסטוריה:\n${conversationContext}\n` : ''}

הודעה נוכחית:
"${userMessage}"

סווג את הכוונה והחזר JSON.
    `.trim();

    // Create Langfuse generation
    const generation = trace.generation({
      name: 'intent-classification-llm',
      model: this.model,
      modelParameters: {
        temperature: 0.3,
        max_tokens: 200
      },
      input: { userMessage, currentState }
    });

    // Call OpenAI
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' }
    });

    // Parse response
    const responseText = completion.choices[0].message.content;
    let parsedResult = JSON.parse(responseText);

    // Validate intent
    if (!this.intents.includes(parsedResult.intent)) {
      logger.warn('Invalid intent returned, defaulting to general_info', {
        returned: parsedResult.intent,
        validIntents: this.intents
      });
      parsedResult.intent = 'general_info';
    }

    // Ensure keywords is array
    if (!Array.isArray(parsedResult.keywords)) {
      parsedResult.keywords = [];
    }

    const result = {
      intent: parsedResult.intent,
      keywords: parsedResult.keywords,
      method: 'llm'
    };

    // Cache the result
    this._cacheResult(cacheKey, result);

    // Update Langfuse
    const duration = Date.now() - startTime;
    generation.update({
      output: result,
      metadata: {
        duration,
        tokensUsed: completion.usage?.total_tokens
      }
    });
    trace.update({ output: result, metadata: { duration } });

    // Log success
    console.timeEnd('intent-classification');
    logger.info('Intent classified (LLM)', {
      intent: result.intent,
      keywordCount: result.keywords.length,
      duration,
      method: 'llm'
    });

    return result;
  }

  /**
   * Cache classification result
   * @private
   */
  _cacheResult(cacheKey, result) {
    // Limit cache size
    if (this.classificationCache.size >= this.maxCacheSize) {
      // Remove oldest entry (simple FIFO - remove first key)
      const firstKey = this.classificationCache.keys().next().value;
      this.classificationCache.delete(firstKey);
    }
    this.classificationCache.set(cacheKey, result);
  }

}

// Export singleton instance
module.exports = new IntentClassifier();
