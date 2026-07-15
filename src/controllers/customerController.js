import Customer from '../models/Customer.js';
import asyncHandler from '../middleware/asyncHandler.js';

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private/Admin
const getCustomers = asyncHandler(async (req, res) => {
  const customers = await Customer.find().sort({ createdAt: -1 });
  res.json(customers);
});

// @desc    Get a single customer by ID
// @route   GET /api/customers/:id
// @access  Private/Admin
const getCustomerById = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  res.json(customer);
});

// @desc    Create a new customer
// @route   POST /api/customers
// @access  Private/Admin
const createCustomer = asyncHandler(async (req, res) => {
  const { name, location, phone } = req.body;

  if (!name || !location || !phone) {
    return res
      .status(400)
      .json({ message: 'name, location and phone are required' });
  }

  const customer = await Customer.create({ name, location, phone });

  res.status(201).json(customer);
});

// @desc    Update a customer
// @route   PUT /api/customers/:id
// @access  Private/Admin
const updateCustomer = asyncHandler(async (req, res) => {
  const { name, location, phone } = req.body;

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (location !== undefined) updates.location = location;
  if (phone !== undefined) updates.phone = phone;

  const customer = await Customer.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });

  if (!customer) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  res.json(customer);
});

// @desc    Delete a customer
// @route   DELETE /api/customers/:id
// @access  Private/Admin
const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findByIdAndDelete(req.params.id);

  if (!customer) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  res.json({ message: 'Customer removed' });
});

export {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
