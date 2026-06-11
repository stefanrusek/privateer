// Stub for the `sharp` image library (a @huggingface/transformers dependency
// used only for vision models). p9r runs text-only inference; image decoding
// is unsupported in the single binary, so any call throws.
function sharp() {
  throw new Error('image processing (sharp) is not available in p9r');
}
module.exports = sharp;
module.exports.default = sharp;
