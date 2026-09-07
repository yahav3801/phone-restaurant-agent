/**
 * Tool Registry for VAPI Workflows
 *
 * Maps workflow tool nodes to webhook function definitions.
 * Registers tools with VAPI API and returns toolIds for use in workflow nodes.
 */

const logger = require('../utils/logger');

/**
 * Get tool definitions for a restaurant
 * These tools will be registered with VAPI and called via webhooks
 *
 * @param {Object} restaurant - Restaurant document
 * @param {string} baseUrl - Base URL for webhook endpoints
 * @returns {Object} Tool definitions mapped by tool name
 */
function getToolDefinitions(restaurant, baseUrl) {
  const webhookUrl = `${baseUrl}/webhooks/vapi`;
  const webhookSecret = restaurant.vapi?.webhookSecret || '';

  return {
    search_menu: {
      type: 'function',
      async: false,
      function: {
        name: 'search_menu',
        description: 'חיפוש פריטים בתפריט של המסעדה באמצעות חיפוש סמנטי',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'מה הלקוח מחפש - שם מנה, קטגוריה, או תיאור'
            },
            limit: {
              type: 'number',
              description: 'מספר התוצאות המקסימלי להחזיר',
              default: 5
            },
            inStockOnly: {
              type: 'boolean',
              description: 'להחזיר רק פריטים במלאי',
              default: true
            }
          },
          required: ['query']
        }
      },
      server: {
        url: webhookUrl,
        secret: webhookSecret
      }
    },

    get_restaurant_info: {
      type: 'function',
      async: false,
      function: {
        name: 'get_restaurant_info',
        description: 'קבלת מידע על המסעדה - שעות פתיחה, כתובת, מדיניות משלוח, כשרות וכו',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'מה לבדוק (אופציונלי) - למשל "hours", "address", "delivery", "kosher". אם ריק, מחזיר את כל המידע'
            }
          },
          required: []
        }
      },
      server: {
        url: webhookUrl,
        secret: webhookSecret
      }
    },

    get_cart_summary: {
      type: 'function',
      async: false,
      function: {
        name: 'get_cart_summary',
        description: 'קבלת סיכום ההזמנה הנוכחית - פריטים וסכום כולל',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      server: {
        url: webhookUrl,
        secret: webhookSecret
      }
    },

    add_to_cart: {
      type: 'function',
      async: false,
      function: {
        name: 'add_to_cart',
        description: 'הוספת פריט לעגלה',
        parameters: {
          type: 'object',
          properties: {
            itemName: {
              type: 'string',
              description: 'שם הפריט להוספה'
            },
            quantity: {
              type: 'number',
              description: 'כמות'
            }
          },
          required: ['itemName', 'quantity']
        }
      },
      server: {
        url: webhookUrl,
        secret: webhookSecret
      }
    },

    update_cart: {
      type: 'function',
      async: false,
      function: {
        name: 'update_cart',
        description: 'עדכון עגלה - עדכון פריטים, שינוי כמויות, או ניקוי עגלה (עם מערך ריק)',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              description: 'מערך פריטים לעדכון. אם ריק, מנקה את העגלה. כל פריט צריך name ו-quantity (אם quantity=0, מוחק את הפריט)',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'שם הפריט'
                  },
                  quantity: {
                    type: 'number',
                    description: 'כמות (0 למחיקה)'
                  }
                },
                required: ['name', 'quantity']
              }
            }
          },
          required: ['items']
        }
      },
      server: {
        url: webhookUrl,
        secret: webhookSecret
      }
    },

    place_order: {
      type: 'function',
      async: false,
      function: {
        name: 'place_order',
        description: 'שליחת הזמנה סופית למסעדה',
        parameters: {
          type: 'object',
          properties: {
            customerName: {
              type: 'string',
              description: 'שם הלקוח'
            },
            phoneNumber: {
              type: 'string',
              description: 'מספר טלפון של הלקוח'
            },
            paymentType: {
              type: 'string',
              enum: ['delivery', 'pickup'],
              description: 'סוג השירות - משלוח או איסוף עצמי'
            },
            deliveryAddress: {
              type: 'string',
              description: 'כתובת למשלוח (רק במקרה של delivery)'
            }
          },
          required: ['customerName', 'phoneNumber', 'paymentType']
        }
      },
      server: {
        url: webhookUrl,
        secret: webhookSecret
      }
    }
  };
}

/**
 * Register tools with VAPI and return toolId mappings
 *
 * @param {Object} vapiClient - VAPI SDK client instance
 * @param {Object} restaurant - Restaurant document
 * @param {string} baseUrl - Base URL for webhook endpoints
 * @returns {Promise<Object>} Map of tool names to toolIds
 */
async function registerTools(vapiClient, restaurant, baseUrl) {
  const toolDefinitions = getToolDefinitions(restaurant, baseUrl);
  const toolIdMap = {};

  logger.info('Registering tools with VAPI', {
    restaurantId: restaurant._id,
    toolCount: Object.keys(toolDefinitions).length
  });

  for (const [toolName, toolDef] of Object.entries(toolDefinitions)) {
    try {
      logger.debug(`Registering tool: ${toolName}`, { toolDef });

      // Register tool with VAPI
      const registeredTool = await vapiClient.tools.create(toolDef);

      toolIdMap[toolName] = registeredTool.id;

      logger.info(`✅ Registered tool: ${toolName}`, {
        toolId: registeredTool.id,
        restaurantId: restaurant._id
      });

    } catch (error) {
      logger.error(`❌ Failed to register tool: ${toolName}`, {
        error: error.message,
        restaurantId: restaurant._id
      });
      throw new Error(`Tool registration failed for ${toolName}: ${error.message}`);
    }
  }

  logger.info('All tools registered successfully', {
    restaurantId: restaurant._id,
    toolIds: toolIdMap
  });

  return toolIdMap;
}

/**
 * Update workflow nodes with registered toolIds
 *
 * @param {Array} nodes - Workflow nodes array
 * @param {Object} toolIdMap - Map of tool names to toolIds
 * @returns {Array} Updated nodes with toolIds
 */
function updateNodesWithToolIds(nodes, toolIdMap) {
  return nodes.map(node => {
    if (node.type === 'tool' && node.toolId === null) {
      // Map node names to tool names
      const toolMapping = {
        'tool_1765187908611': 'search_menu',      // First search menu call
        'tool_1765187763737': 'add_to_cart',      // Add item to cart
        'tool_1765188100233': 'place_order'       // Final place order
      };

      const toolName = toolMapping[node.name];
      if (toolName && toolIdMap[toolName]) {
        node.toolId = toolIdMap[toolName];
        logger.debug(`Mapped node ${node.name} to tool ${toolName} (${toolIdMap[toolName]})`);
      }
    }

    return node;
  });
}

/**
 * Get tool name from workflow node
 * Helper function to map node names to tool function names
 *
 * @param {Object} node - Workflow node
 * @returns {string|null} Tool name or null
 */
function getToolNameFromNode(node) {
  const toolMapping = {
    'tool_1765187908611': 'search_menu',
    'tool_1765187763737': 'add_to_cart',
    'tool_1765188100233': 'place_order'
  };

  return toolMapping[node.name] || null;
}

module.exports = {
  getToolDefinitions,
  registerTools,
  updateNodesWithToolIds,
  getToolNameFromNode
};
