import * as webpush from "jsr:@negrel/webpush@0.5.0";

const keys = await webpush.generateVapidKeys({ extractable: true });
const publicKey = await webpush.exportApplicationServerKey(keys);
const keyPair = await webpush.exportVapidKeys(keys);

console.log(JSON.stringify({ publicKey, keyPair }, null, 2));
