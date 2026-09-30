const { resolveMongoUri, redactMongoUri, resetWarningForTests } = require('../config/mongoUri');

beforeEach(() => resetWarningForTests());

describe('resolveMongoUri', () => {
  it('uses MONGODB_URI when set, without warning', () => {
    const warn = jest.fn();
    expect(resolveMongoUri({ MONGODB_URI: 'mongodb://a/db' }, warn)).toBe('mongodb://a/db');
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to the legacy MONGO_URI with a deprecation warning', () => {
    const warn = jest.fn();
    expect(resolveMongoUri({ MONGO_URI: 'mongodb://legacy/db' }, warn)).toBe('mongodb://legacy/db');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/MONGO_URI is deprecated.*MONGODB_URI/);
  });

  it('prefers MONGODB_URI when both are set, warning only if they differ', () => {
    const warn = jest.fn();
    expect(resolveMongoUri({ MONGODB_URI: 'mongodb://new/db', MONGO_URI: 'mongodb://new/db' }, warn)).toBe('mongodb://new/db');
    expect(warn).not.toHaveBeenCalled();
    expect(resolveMongoUri({ MONGODB_URI: 'mongodb://new/db', MONGO_URI: 'mongodb://old/db' }, warn)).toBe('mongodb://new/db');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when neither is set', () => {
    expect(resolveMongoUri({}, jest.fn())).toBeUndefined();
  });
});

describe('redactMongoUri', () => {
  it('removes embedded credentials and leaves credential-less URIs alone', () => {
    expect(redactMongoUri('mongodb+srv://user:p4ss@cluster.example/db')).toBe('mongodb+srv://[redacted]@cluster.example/db');
    expect(redactMongoUri('connect failed for mongodb://u:p@h:27017/x')).toBe('connect failed for mongodb://[redacted]@h:27017/x');
    expect(redactMongoUri('mongodb://127.0.0.1:27017/pyquiz')).toBe('mongodb://127.0.0.1:27017/pyquiz');
  });
});
