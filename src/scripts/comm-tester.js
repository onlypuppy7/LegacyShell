import { Comm, DynamicComm } from '#comm';

const iterationCount = 10000;
let staticOutputData = [];
let dynamicOutputData = [];

var int32 = Math.random() * 1e6;
var float = Math.random();

let commStatic
let commDynamic

function measureStaticBuffer(size) {
    let totalTime = 0;

    for (let j = 0; j < iterationCount; j++) {
        const startTime = performance.now();

        // Create a static buffer and simulate packing various data types
        commStatic = Comm.output(size);
        for (let i = 0; i < size / 8; i++) {
            commStatic.packInt32(int32);
            commStatic.packFloat(float);
        }

        const endTime = performance.now();
        totalTime += endTime - startTime;

        // Store the buffer data for later comparison
        if (j === 0) {
            staticOutputData = commStatic.buffer; // Store first iteration output for comparison
        }
    }

    return totalTime / iterationCount; // Return average time
}

function measureDynamicBuffer(size) {
    let totalTime = 0;

    for (let j = 0; j < iterationCount; j++) {
        const startTime = performance.now();

        // Create a dynamic buffer and simulate packing various data types
        commDynamic = DynamicComm.output(size);
        for (let i = 0; i < size / 8; i++) {
            commDynamic.packInt32(int32);
            commDynamic.packFloat(float);
        }

        const endTime = performance.now();
        totalTime += endTime - startTime;

        // Store the buffer data for later comparison
        if (j === 0) {
            dynamicOutputData = Array.from(commDynamic.buffer); // Store first iteration output for comparison
        }
    }

    return totalTime / iterationCount; // Return average time
}

// Test with different sizes
const sizes = [1024, 4096, 16384, 65536, 262144];  // Different buffer sizes to test
sizes.forEach(size => {
    const staticTime = measureStaticBuffer(size);
    const dynamicTime = measureDynamicBuffer(size);

    console.log(`Buffer Size: ${size} bytes`);
    console.log(`Static Buffer Time (Avg): ${staticTime.toFixed(3)} ms`);
    console.log(`Dynamic Buffer Time (Avg): ${dynamicTime.toFixed(3)} ms`);

    // Compare the outputs
    const isEqual = JSON.stringify(staticOutputData) === JSON.stringify(dynamicOutputData);
    // console.log(staticOutputData)
    // console.log(dynamicOutputData)
    console.log(`Outputs Match: ${isEqual ? "Yes" : "No"}`);

    console.log('---');
});
