// middleware/errorHandler.js — two small helpers.
// wrap(): Express 4 does not catch errors thrown inside async handlers,
//         so wrap() forwards them to the central error handler.
// errorHandler(): gives every error a sensible HTTP status code.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function errorHandler(err, req, res, next) {
  console.error('ERROR:', err.message);

  // Invalid JSON body  → 400
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON in request body' });
  }
  // Mongoose field validation (e.g. missing title) → 400
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message });
  }
  // Bad ObjectId in the URL → 400
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid id format' });
  }
  // Duplicate key (email already registered) → 409
  if (err.code === 11000) {
    return res.status(409).json({ message: 'Duplicate value: ' + Object.keys(err.keyValue).join(', ') });
  }
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
}

module.exports = { wrap, errorHandler };
