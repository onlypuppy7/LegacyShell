import bcrypt from 'bcrypt';
import { performance } from 'perf_hooks';

const testPassword = 'sample_password';
const maxTime = 2000;
const numIterations = 3;
const results = [];

(async () => {
  for (let cost = 1; cost <= 20; cost++) {
    let totalTime = 0;

    for (let i = 0; i < numIterations; i++) {
      const start = performance.now();
      await bcrypt.hash(testPassword, cost);
      const end = performance.now();
      totalTime += (end - start);
    };

    const averageTime = totalTime / numIterations;
    results.push({ cost, averageTime });

    console.log(`Cost: ${cost}, Average Time: ${averageTime.toFixed(2)}ms`);

    if (averageTime > maxTime) {
      break;
    };
  };

  const recommended = results.filter(result => result.averageTime >= 250 && result.averageTime <= 500);

  console.log('\nRecommended cost factors (250ms - 500ms):');
  recommended.forEach(result => {
    console.log(`Cost: ${result.cost}, Average Time: ${result.averageTime.toFixed(2)}ms`);
  });
})();
