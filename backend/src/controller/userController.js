const userService = require('../service/userService');

exports.listUsers = async (req, res) => {
  try {
    const users = await userService.listUsers();
    res.status(200).send({ success: true, data: users });
  } catch (err) {
    res.status(err.status || 500).send({ message: err.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const user = await userService.createUser(req.body);
    res.status(201).send({ success: true, data: user });
  } catch (err) {
    res.status(err.status || 500).send({ message: err.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const user = await userService.updateUser(Number(req.params.id), req.body);
    res.status(200).send({ success: true, data: user });
  } catch (err) {
    res.status(err.status || 500).send({ message: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const profile = await userService.getProfile(req.userId);
    res.status(200).send({ success: true, data: profile });
  } catch (err) {
    res.status(err.status || 500).send({ message: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const profile = await userService.updateProfile(req.userId, req.body);
    res.status(200).send({ success: true, data: profile, message: 'Profile updated successfully' });
  } catch (err) {
    res.status(err.status || 500).send({ message: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const result = await userService.deleteUser(Number(req.params.id));
    res.status(200).send(result);
  } catch (err) {
    res.status(err.status || 500).send({ message: err.message });
  }
};
