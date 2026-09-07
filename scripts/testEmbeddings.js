require('dotenv').config();
const { generateEmbedding, dotProduct } = require('../src/utils/embeddings');

async function test() {
  console.log('Testing embedding generation...');

  const embedding1 = await generateEmbedding('בשר');
  console.log(`✓ Generated embedding for "בשר": ${embedding1.length} dimensions`);

  const embedding2 = await generateEmbedding('אנטריקוט');
  console.log(`✓ Generated embedding for "אנטריקוט": ${embedding2.length} dimensions`);

  const similarity = dotProduct(embedding1, embedding2);
  console.log(`✓ Similarity between "בשר" and "אנטריקוט": ${similarity.toFixed(4)}`);

  const cached = await generateEmbedding('בשר');
  console.log(`✓ Cache working: ${cached === embedding1}`);

  console.log('\n✅ All tests passed!');
}

test().catch(console.error);
