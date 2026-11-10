const assert = require("node:assert/strict");
const { createSafeRemoteLookup } = require("../backend/remote-image");

function invoke(lookup, options = {}) {
  return new Promise((resolve, reject) => {
    lookup("images.example", options, (error, address, family) => {
      if (error) reject(error);
      else resolve({ address, family });
    });
  });
}

(async () => {
  const seenOptions = [];
  const publicLookup = createSafeRemoteLookup(async (_hostname, options) => {
    seenOptions.push(options);
    return options.family === 4
      ? [{ address: "93.184.216.34", family: 4 }]
      : [{ address: "93.184.216.34", family: 4 }, { address: "2606:4700::1111", family: 6 }];
  });

  const all = await invoke(publicLookup, { all: true, hints: 0 });
  assert.deepEqual(all.address, [
    { address: "93.184.216.34", family: 4 },
    { address: "2606:4700::1111", family: 6 }
  ], "Node all:true lookup receives the expected address/family array");
  assert.equal(seenOptions[0].all, true);
  assert.equal(seenOptions[0].hints, 0);

  const single = await invoke(publicLookup, { all: false, family: 4 });
  assert.deepEqual(single, { address: "93.184.216.34", family: 4 }, "Single-address lookup preserves callback(address, family) semantics");
  assert.equal(seenOptions[1].family, 4, "Requested address family is passed to DNS");

  const mixedLookup = createSafeRemoteLookup(async () => [
    { address: "203.0.113.12", family: 4 },
    { address: "192.168.1.12", family: 4 }
  ]);
  await assert.rejects(invoke(mixedLookup, { all: true }), (error) => error.statusCode === 403,
    "Mixed public/private answers fail closed instead of returning only the public address");

  const emptyFamilyLookup = createSafeRemoteLookup(async () => [{ address: "203.0.113.12", family: 4 }]);
  await assert.rejects(invoke(emptyFamilyLookup, { family: 6 }), (error) => error.statusCode === 403,
    "No matching-family answer is rejected");

  const { isPrivateOrReservedAddress } = require("../backend/remote-image");
  for (const address of ["169.254.4.1", "100.64.0.1", "fe90::1", "ff02::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPrivateOrReservedAddress(address), true, "Reserved address is rejected: " + address);
  }
  for (const address of ["8.8.8.8", "2606:4700::1111"]) {
    assert.equal(isPrivateOrReservedAddress(address), false, "Global unicast address is allowed: " + address);
  }

  console.log("Remote image lookup tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
