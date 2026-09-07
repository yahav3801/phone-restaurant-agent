/**
 * ⚠️  DEPRECATED: Workflow-based approach replaced with Assistant + Custom LLM
 *
 * This file is kept for reference only. As of Step 11, the application uses:
 * - Vapi Assistants (simpler configuration)
 * - Custom LLM endpoint: /v1/chat/completions
 * - Direct integration with LiteLLM + Gemini 3 Flash
 *
 * Benefits of new approach:
 * - Full control over conversation orchestration (state machine, intent, RAG)
 * - Better observability (all requests logged to Langfuse)
 * - Cost optimization (Gemini 3 Flash is 97% cheaper than GPT-4o)
 * - Simpler configuration (no complex workflow graphs)
 *
 * Migration:
 * - See docs/VAPI_ASSISTANT_SETUP.md for new setup instructions
 * - See docs/TESTING_GUIDE.md for testing procedures
 *
 * DO NOT USE for new integrations.
 */

/**
 * VAPI Workflow Template Generator
 *
 * This module generates workflow configurations with Cartesia Sonic 3 Hebrew voice.
 * Based on the user-provided workflow JSON with state machine logic for restaurant orders.
 *
 * Flow:
 * 1. introduction - Classify caller intent (order vs other)
 * 2a. Order path: ask what to order → search menu → present results → add to cart → delivery → place order
 * 2b. Other path: offer transfer to human
 */

/**
 * Get the base workflow template for a restaurant
 * @param {Object} restaurant - Restaurant document from MongoDB
 * @returns {Object} Workflow configuration object
 */
function getWorkflowTemplate(restaurant) {
  const voiceConfig = {
    provider: restaurant.workflowConfig?.voiceSettings?.provider || 'cartesia',
    model: restaurant.workflowConfig?.voiceSettings?.model || 'sonic-3',
    voiceId: restaurant.workflowConfig?.voiceSettings?.voiceId || '3e32f3c5-9ac0-4192-9994-87fdb277120f',
    language: restaurant.workflowConfig?.voiceSettings?.language || 'he'
  };

  const transcriber = {
    language: 'he-IL',
    provider: 'azure'
  };

  const modelConfig = {
    model: 'gpt-4o-mini',
    provider: 'openai',
    maxTokens: 250,
    temperature: 0.3
  };

  return {
    name: `${restaurant.name}_order_workflow`,

    // Global prompt applied to all nodes
    globalPrompt: generateGlobalPrompt(restaurant),

    // Voice configuration (Sonic 3 Hebrew)
    voice: voiceConfig,

    // Workflow nodes
    nodes: [
      // Node 1: Introduction - Classify caller intent
      {
        name: 'introduction',
        type: 'conversation',
        isStart: true,
        metadata: {
          position: { x: -416.95, y: -379.57 }
        },
        prompt: 'Your job is to determine what the caller wants. Classify the call into one of the following paths:\nFood Order – The caller wants to order food for delivery or pickup.\nGeneral Restaurant Information – The caller is asking general questions (hours, address, kashrut, delivery areas, etc.).\nHuman Agent / Other – Table reservations, complaints, issues, or anything unrelated to placing a food order.',
        model: modelConfig,
        transcriber: transcriber,
        messagePlan: {
          firstMessage: restaurant.workflowConfig?.firstMessage || restaurant.firstMessage || 'שלום איך אפשר לעזור'
        },
        toolIds: []  // Will be populated during tool registration
      },

      // Node 2: Handle non-order requests (transfer to human)
      {
        name: 'conversation_1765184001561',
        type: 'conversation',
        metadata: {
          position: { x: 76.79, y: 185.78 }
        },
        prompt: `The caller is not ordering food.\nPolitely offer to transfer them to a human representative at ${restaurant.humanRedirectPhone || 'המסעדה'}.\nKeep the message short and in Hebrew.`,
        model: modelConfig,
        transcriber: transcriber,
        messagePlan: {
          firstMessage: ''
        },
        toolIds: []
      },

      // Node 3: Ask what to order
      {
        name: 'conversation_1765184024967',
        type: 'conversation',
        metadata: {
          position: { x: -822.22, y: 181.83 }
        },
        prompt: 'Ask the caller what item they would like to order.\nKeep it very short and in Hebrew.\nYour goal is to collect a dish name or category and then trigger the search menu tool.\nDo not ask multiple questions at once.',
        model: modelConfig,
        transcriber: transcriber,
        messagePlan: {
          firstMessage: ''
        },
        toolIds: []
      },

      // Node 4: Transfer to human (tool node)
      {
        name: 'transfer_1765184269934',
        type: 'tool',
        metadata: {
          position: { x: 92.05, y: 608.57 }
        },
        tool: {
          type: 'transferCall',
          destinations: [
            {
              type: 'number',
              number: restaurant.humanRedirectPhone || '',
              message: 'מעביר אותך לנציג'
            }
          ]
        }
      },

      // Node 5: Search menu (tool node - will be populated with toolId)
      {
        name: 'tool_1765187908611',
        type: 'tool',
        metadata: {
          position: { x: -820.89, y: 512.23 }
        },
        toolId: null  // Will be set during tool registration (search_menu)
      },

      // Node 6: Present search results
      {
        name: 'conversation_1765187794315',
        type: 'conversation',
        metadata: {
          position: { x: -823.33, y: 730.19 }
        },
        prompt: 'You received menu search results.\nRead them clearly in Hebrew and help the caller choose one of the items.\nIf the results do not match what the caller wants, ask them how they want to refine the request.\nYour job is to guide them to either pick an item or refine and repeat the search.',
        model: {
          ...modelConfig,
          model: 'gpt-4o'  // Use more capable model for presenting results
        },
        transcriber: transcriber,
        messagePlan: {
          firstMessage: ''
        },
        toolIds: []
      },

      // Node 7: Refine search
      {
        name: 'conversation_1765187772996',
        type: 'conversation',
        metadata: {
          position: { x: -1388.29, y: 1127.96 }
        },
        prompt: 'Ask the caller how they want to refine or clarify what they\'re looking for.\nExamples: different dish, different size, different ingredient, different type.\nKeep it short and in Hebrew.\nYour goal is to gather a better query for the next search.',
        model: modelConfig,
        transcriber: transcriber,
        messagePlan: {
          firstMessage: ''
        },
        toolIds: []
      },

      // Node 8: Add item to cart (tool node - will be populated with toolId)
      {
        name: 'tool_1765187763737',
        type: 'tool',
        metadata: {
          position: { x: 101.20, y: 1126.11 }
        },
        toolId: null  // Will be set during tool registration (add_to_cart or place_order variant)
      },

      // Node 9: Ask if adding more items
      {
        name: 'conversation_1765188018631',
        type: 'conversation',
        metadata: {
          position: { x: 99.70, y: 1478.99 }
        },
        prompt: 'Confirm the item was added to the order.\nAsk the caller if they want to add anything else.\nIf yes: ask what item, then the system will loop back into the menu search.\nIf no: proceed to collect the delivery details.\nKeep it short and in Hebrew.',
        model: modelConfig,
        transcriber: transcriber,
        messagePlan: {
          firstMessage: ''
        },
        toolIds: []
      },

      // Node 10: Collect delivery details
      {
        name: 'conversation_1765188067800',
        type: 'conversation',
        metadata: {
          position: { x: 74.30, y: 1922.63 }
        },
        prompt: `Collect the caller's delivery details: full address, city, floor, entrance, and any notes.\nAsk one field at a time, very clearly and briefly.\nIf the caller wants pickup, simply confirm pickup instead of collecting address details.\nIf caller asks about delivery fees or minimum order, use get_restaurant_info("delivery") to get current policies.\nKeep everything in Hebrew.`,
        model: {
          ...modelConfig,
          model: 'gpt-4o'  // Use more capable model for collecting details
        },
        transcriber: transcriber,
        messagePlan: {
          firstMessage: ''
        },
        toolIds: []
      },

      // Node 11: Place order (tool node - will be populated with toolId)
      {
        name: 'tool_1765188100233',
        type: 'tool',
        metadata: {
          position: { x: 52.07, y: 2324.19 }
        },
        toolId: null  // Will be set during tool registration (place_order)
      },

      // Node 12: Confirm order and thank caller
      {
        name: 'conversation_1765188110327',
        type: 'conversation',
        metadata: {
          position: { x: 23.78, y: 2612.60 }
        },
        prompt: 'Summarize the order in Hebrew very briefly.\nConfirm the payment link will be sent (or payment method used).\nThank the caller politely and tell them the order is being processed.\nThen end the call.',
        model: modelConfig,
        transcriber: transcriber,
        messagePlan: {
          firstMessage: ''
        },
        toolIds: []
      },

      // Node 13: Hangup (tool node)
      {
        name: 'hangup_1765188123673',
        type: 'tool',
        metadata: {
          position: { x: 32.37, y: 3044.93 }
        },
        tool: {
          type: 'endCall'
        }
      }
    ],

    // Workflow edges (state transitions)
    edges: [
      // From introduction: classify intent
      {
        from: 'introduction',
        to: 'conversation_1765184001561',
        condition: {
          type: 'ai',
          prompt: 'caller wants something that isnt related to making a delivery/pickup orders. for example, asking about an existing order, book a table, make a complaint etc.'
        }
      },
      {
        from: 'introduction',
        to: 'conversation_1765184024967',
        condition: {
          type: 'ai',
          prompt: 'caller wants to make a delivery or pickup order.'
        }
      },

      // From non-order conversation: transfer to human
      {
        from: 'conversation_1765184001561',
        to: 'transfer_1765184269934',
        condition: {
          type: 'ai',
          prompt: 'if the user said yes'
        }
      },

      // From "ask what to order": search menu
      {
        from: 'conversation_1765184024967',
        to: 'tool_1765187908611',
        condition: {
          type: 'ai',
          prompt: ''
        }
      },

      // From search menu: present results
      {
        from: 'tool_1765187908611',
        to: 'conversation_1765187794315',
        condition: {
          type: 'ai',
          prompt: ''
        }
      },

      // From present results: add item or refine
      {
        from: 'conversation_1765187794315',
        to: 'tool_1765187763737',
        condition: {
          type: 'ai',
          prompt: 'user wants to order this item'
        }
      },
      {
        from: 'conversation_1765187794315',
        to: 'conversation_1765187772996',
        condition: {
          type: 'ai',
          prompt: 'user doesnt want to order this item'
        }
      },

      // From refine search: back to search menu
      {
        from: 'conversation_1765187772996',
        to: 'tool_1765187908611',
        condition: {
          type: 'ai',
          prompt: ''
        }
      },

      // From add item: ask if more items
      {
        from: 'tool_1765187763737',
        to: 'conversation_1765188018631',
        condition: {
          type: 'ai',
          prompt: ''
        }
      },

      // From ask if more items: loop back or continue
      {
        from: 'conversation_1765188018631',
        to: 'tool_1765187908611',
        condition: {
          type: 'ai',
          prompt: 'user said yes'
        }
      },
      {
        from: 'conversation_1765188018631',
        to: 'conversation_1765188067800',
        condition: {
          type: 'ai',
          prompt: 'if the user said no'
        }
      },

      // From collect delivery: place order
      {
        from: 'conversation_1765188067800',
        to: 'tool_1765188100233',
        condition: {
          type: 'ai',
          prompt: 'if the user said yes'
        }
      },

      // From place order: confirm
      {
        from: 'tool_1765188100233',
        to: 'conversation_1765188110327',
        condition: {
          type: 'ai',
          prompt: ''
        }
      },

      // From confirm: hangup
      {
        from: 'conversation_1765188110327',
        to: 'hangup_1765188123673',
        condition: {
          type: 'ai',
          prompt: 'if the user said yes'
        }
      }
    ]
  };
}

/**
 * Generate the global prompt for the workflow
 * Applied to all conversation nodes
 */
function generateGlobalPrompt(restaurant) {
  return `You are a Hebrew-speaking phone agent for a restaurant named "${restaurant.name}".
Your job is to understand the caller's intent and respond naturally, concisely, and helpfully.
All procedural logic (what to ask next, what flow to follow) is controlled by the nodes — not by you.

🔹 GENERAL BEHAVIOR

Always speak natural Israeli Hebrew, friendly and human-like.
Keep answers very short, 1–3 sentences max.
Be calm, polite, and helpful at all times.
If the caller is confused, rephrase simply instead of repeating the same words.
Do not over-ask: ask only what the node prompt requires at that moment.
Never assume things the caller did not say.

🔹 MENU & FOOD LOGIC

Use search_menu whenever the caller mentions food, drinks, menu items, or categories.
Never invent: new dishes, sizes, toppings, combos, prices, or ingredients.
Never guess a price. Prices must come from search results only.
Read out items exactly as returned by tools.

🔹 TOOL USAGE RULES

search_menu(query):
Use whenever caller describes a dish, category, ingredient, or asks what's available.

get_restaurant_info(query?):
Use when caller asks about restaurant information:
- Hours/opening times: get_restaurant_info("hours")
- Address/location: get_restaurant_info("address")
- Delivery policies/fees: get_restaurant_info("delivery")
- Pickup availability: get_restaurant_info("pickup")
- Kosher status: get_restaurant_info("kosher")
- General info: get_restaurant_info() (no query)

get_cart_summary():
Use to check what's currently in the cart/order. Call this when caller asks what they have, or to confirm before placing order.

add_to_cart(itemName, quantity):
Use to add an item to the cart after caller confirms they want it. Always use exact item name from search_menu results.

update_cart(items):
Use to modify cart items (change quantities, remove items). Pass array of {name, quantity} - use quantity=0 to remove item, empty array [] to clear cart.

place_order(customerName, phoneNumber, paymentType, deliveryAddress?):
Use only after the order is fully confirmed by the node flow.
Use the actual values collected (not placeholders).
PaymentType must be "delivery" or "pickup".
Include deliveryAddress only if paymentType is "delivery".

🔹 STYLE & SPEECH RULES

Always respond in Hebrew.
Keep tone friendly, smooth, and conversational — like an Israeli restaurant worker.
You may use light fillers ("אממ…", "רגע…") but not too much.
Do not translate English names or brand terms unless needed.
Do not speak in long paragraphs. Keep everything short.

🔹 STRICT DON'TS

Don't make assumptions about menu items.
Don't make up prices.
Don't take payment yourself (handled externally).
Don't explain internal logic or mention the system, nodes, or tools.
Don't switch to English unless caller forces it.
Don't ask multiple questions at once.

✔ Your top-level goal
Understand what the caller wants, answer naturally and briefly in Hebrew, use tools correctly, and let the nodes control the flow.`;
}

/**
 * Inject restaurant-specific context into prompt text
 * Replaces placeholders like {{restaurant.name}} with actual values
 */
function injectRestaurantContext(promptText, restaurant) {
  if (!promptText || typeof promptText !== 'string') {
    return promptText;
  }

  return promptText
    .replace(/\{\{restaurant\.name\}\}/g, restaurant.name || 'המסעדה')
    .replace(/\{\{restaurant\.address\}\}/g, restaurant.address || 'לא צוין')
    .replace(/\{\{restaurant\.businessHours\}\}/g, restaurant.businessHours || 'לא צוין')
    .replace(/\{\{restaurant\.phoneNumber\}\}/g, restaurant.phoneNumber || 'לא צוין')
    .replace(/\{\{restaurant\.deliveryFee\}\}/g, String(restaurant.settings?.deliveryFee || 0))
    .replace(/\{\{restaurant\.minimumOrder\}\}/g, String(restaurant.settings?.minimumOrder || 0))
    .replace(/\{\{restaurant\.humanRedirectPhone\}\}/g, restaurant.humanRedirectPhone || 'לא זמין')
    .replace(/\{\{restaurant\.id\}\}/g, String(restaurant._id));
}

module.exports = {
  getWorkflowTemplate,
  generateGlobalPrompt,
  injectRestaurantContext
};
