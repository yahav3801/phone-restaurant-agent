# MongoDB Atlas Vector Search Migration Guide

This guide walks through migrating from local MongoDB with client-side vector search to MongoDB Atlas with native vector search.

## Prerequisites

- MongoDB Atlas account (free tier OK for testing)
- Atlas M10+ cluster for production (vector search requires M10+)
- Local MongoDB backup of restaurant_phone_agent database

## Phase 1: Atlas Cluster Setup

### 1.1 Create Atlas Account
1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up for free account
3. Verify email address

### 1.2 Create Cluster
1. Click "Build a Database"
2. Choose cluster tier:
   - **Testing**: M0 Free Tier (NO vector search support)
   - **Production**: M10+ (required for vector search)
3. Choose cloud provider and region (AWS us-east-1 recommended)
4. Cluster name: `restaurant-phone-agent`
5. Click "Create Cluster" (takes 5-10 minutes)

### 1.3 Configure Network Access
1. Go to "Network Access" tab
2. Click "Add IP Address"
3. Options:
   - **Development**: Add Current IP Address
   - **Production**: Add specific server IPs or 0.0.0.0/0 (less secure)
4. Click "Confirm"

### 1.4 Create Database User
1. Go to "Database Access" tab
2. Click "Add New Database User"
3. Authentication Method: Password
4. Username: `restaurant-agent`
5. Password: Generate secure password (save it!)
6. Database User Privileges: "Read and write to any database"
7. Click "Add User"

### 1.5 Get Connection String
1. Go to cluster → Click "Connect"
2. Choose "Connect your application"
3. Driver: Node.js, Version: 5.5 or later
4. Copy connection string:
   ```
   mongodb+srv://<db_user>:<db_password>@<your-cluster>.mongodb.net/?retryWrites=true&w=majority
   ```
5. Replace `<db_password>` with your database user password
6. Add database name: `/restaurant_phone_agent`

Final connection string (fill in your own values, never commit this):
```
mongodb+srv://<db_user>:<db_password>@<your-cluster>.mongodb.net/restaurant_phone_agent?retryWrites=true&w=majority
```

## Phase 2: Data Migration

### 2.1 Export from Local MongoDB
```bash
# Export entire database
mongodump --uri="mongodb://localhost:27017/restaurant_phone_agent" --out=./backup

# Verify export
ls -lh ./backup/restaurant_phone_agent/
# Should see: knowledge_base.bson, orders.bson, restaurants.bson, etc.
```

### 2.2 Import to Atlas
```bash
# Import to Atlas cluster (fill in your own credentials, never commit this)
mongorestore \
  --uri="mongodb+srv://<db_user>:<db_password>@<your-cluster>.mongodb.net/restaurant_phone_agent" \
  ./backup/restaurant_phone_agent/

# Verify import
mongosh "mongodb+srv://<db_user>:<db_password>@<your-cluster>.mongodb.net/restaurant_phone_agent" \
  --eval "db.knowledge_base.countDocuments()"
# Should match local count (22 menu items + 7 info items = 29 documents)
```

### 2.3 Verify Data Integrity
```javascript
// Connect to Atlas and verify
mongosh "mongodb+srv://..."

use restaurant_phone_agent

// Check knowledge_base collection
db.knowledge_base.countDocuments({ type: 'menu' })  // Should be 22
db.knowledge_base.countDocuments({ type: 'info' })  // Should be 7

// Verify embeddings exist
db.knowledge_base.findOne({ type: 'menu' }, { embedding: 1 })
// embedding array should have 1536 elements

// Check restaurants
db.restaurants.countDocuments()  // Should be 1

// Check orders
db.orders.countDocuments()  // Should match local
```

## Phase 3: Create Vector Search Index

### 3.1 Via Atlas UI
1. Go to Atlas cluster → "Search" tab
2. Click "Create Search Index"
3. Configuration Method: "JSON Editor"
4. Database: `restaurant_phone_agent`
5. Collection: `knowledge_base`
6. Index Name: `knowledge_base_vector_index`
7. Paste this JSON configuration:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "dotProduct"
    },
    {
      "type": "filter",
      "path": "restaurantId"
    },
    {
      "type": "filter",
      "path": "type"
    },
    {
      "type": "filter",
      "path": "inStock"
    }
  ]
}
```

8. Click "Create Search Index"
9. Wait for index to build (status: "Active") - takes 5-30 minutes

### 3.2 Via MongoDB Shell
```javascript
use restaurant_phone_agent

db.knowledge_base.createSearchIndex({
  name: "knowledge_base_vector_index",
  type: "vectorSearch",
  definition: {
    fields: [
      {
        type: "vector",
        path: "embedding",
        numDimensions: 1536,
        similarity: "dotProduct"
      },
      { type: "filter", path: "restaurantId" },
      { type: "filter", path: "type" },
      { type: "filter", path: "inStock" }
    ]
  }
});

// Check index status
db.knowledge_base.getSearchIndexes()
```

### 3.3 Verify Index is Active
```javascript
// In mongosh
db.knowledge_base.getSearchIndexes("knowledge_base_vector_index")

// Status should be "READY" or "ACTIVE"
```

## Phase 4: Update Application Configuration

### 4.1 Update .env
```bash
# Change MongoDB connection (fill in your own credentials, never commit this)
MONGODB_URI=mongodb+srv://<db_user>:<db_password>@<your-cluster>.mongodb.net/restaurant_phone_agent?retryWrites=true&w=majority

# Enable Atlas Vector Search
USE_ATLAS_VECTOR_SEARCH=true
```

### 4.2 Restart Application
```bash
# Stop server
pm2 stop restaurant-phone-agent

# Or if running with npm
Ctrl+C

# Start server
npm start

# Check logs for:
# "RAGSearch initialized" with mode: "Atlas Vector Search"
# "MongoDB connected successfully"
```

## Phase 5: Testing

### 5.1 Run Atlas Test Script
```bash
node scripts/testAtlasVectorSearch.js
```

Expected output:
```
✅ Atlas Vector Search working
✅ Latency: 50-100ms (faster than client-side)
✅ Results match quality expectations
✅ Fallback mechanism working
```

### 5.2 Manual Testing
```bash
# Test menu search
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"אני רוצה פיצה"}]}'

# Check server logs for:
# "Atlas Vector Search called"
# "Atlas Vector Search completed"
# Duration should be 50-100ms
```

### 5.3 Test Fallback
```bash
# Temporarily set invalid index name in ragSearch.js
# Then test - should see:
# "Atlas Vector Search failed, falling back to client-side"
# Search still works (using client-side)
```

## Phase 6: Performance Validation

### 6.1 Benchmark Comparison
```bash
node scripts/benchmarkSearch.js
```

Expected results:
| Metric | Client-Side | Atlas Vector Search | Improvement |
|--------|-------------|---------------------|-------------|
| p50 latency | 150ms | 60ms | 2.5x faster |
| p95 latency | 400ms | 90ms | 4.4x faster |
| p99 latency | 600ms | 120ms | 5x faster |
| Throughput | 20 q/s | 100+ q/s | 5x more |

### 6.2 Monitor in Production
- Check Atlas Metrics tab for query performance
- Monitor application logs for search duration
- Set up alerts for high latency (>200ms)

## Rollback Plan

If Atlas Vector Search has issues, quick rollback:

### Immediate Rollback (< 5 minutes)
```bash
# Update .env
USE_ATLAS_VECTOR_SEARCH=false

# Keep Atlas connection or switch back to local:
# MONGODB_URI=mongodb://localhost:27017/restaurant_phone_agent

# Restart
pm2 restart restaurant-phone-agent
```

No code changes needed - instant rollback!

## Cost Estimation

**Atlas M10 Cluster:**
- Base cost: ~$60/month
- Storage (1GB): Included
- Data transfer: $0.10/GB
- Typical restaurant: ~$70/month total

**Free Tier (M0):**
- Cost: $0
- Limitation: No vector search support
- Use for: Development/testing only

## Troubleshooting

### Issue: "Index not found" error (code 291)
**Solution:**
1. Check index name matches exactly: `knowledge_base_vector_index`
2. Verify index status is "ACTIVE" in Atlas UI
3. Wait if index is still building (can take 30 min)

### Issue: Connection timeout
**Solution:**
1. Check IP whitelist in Atlas Network Access
2. Verify connection string format
3. Test connectivity: `mongosh "mongodb+srv://..."`

### Issue: Slow search performance
**Solution:**
1. Check cluster tier (M10+ required for good performance)
2. Verify index is being used (check Atlas metrics)
3. Reduce `numCandidates` if over-fetching

### Issue: Results quality worse than client-side
**Solution:**
1. Verify similarity metric is "dotProduct" (not cosine)
2. Check embeddings migrated correctly (1536 dimensions)
3. Adjust `minSimilarityScore` threshold

## Success Criteria

✅ Atlas cluster running and accessible
✅ Data migrated successfully (all documents)
✅ Vector search index created and active
✅ Application connects to Atlas
✅ Search latency < 100ms (p95)
✅ Results quality ≥ client-side baseline
✅ Fallback mechanism tested
✅ Monitoring and alerts configured

## Support

- MongoDB Atlas Docs: https://docs.atlas.mongodb.com/
- Vector Search Guide: https://www.mongodb.com/docs/atlas/atlas-vector-search/
- Community Forums: https://www.mongodb.com/community/forums/
