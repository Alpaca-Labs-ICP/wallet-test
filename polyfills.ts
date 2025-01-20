import { Buffer } from "buffer";
import "react-native-get-random-values";
import { TextEncoder, TextDecoder } from "text-encoding";

// Polyfill TextEncoder/TextDecoder
if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === "undefined") {
  global.TextDecoder = TextDecoder;
}

// Polyfill Buffer
global.Buffer = Buffer;
