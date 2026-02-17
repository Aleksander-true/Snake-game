/**
 * Local Jest sequencer fallback.
 * Keeps test order as-is and avoids dependency on external sequencer package.
 */
class LocalSequencer {
  sort(tests) {
    return tests;
  }

  cacheResults() {
    // No-op for local fallback sequencer.
  }
}

module.exports = LocalSequencer;
