const db = require('../models');

const User = db.User;
const Role = db.Role;
const { Op } = db.Sequelize;

const toUserDto = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  fullName: user.preferences?.fullName || '',
  phone: user.preferences?.phone || '',
  roles: user.Role ? [user.Role.name] : [],
  preferences: user.preferences || {},
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const listUsers = async () => {
  const users = await User.findAll({
    include: [{ model: Role }],
    order: [['createdAt', 'DESC']]
  });

  return users.map(toUserDto);
};

const createUser = async ({ username, email, password, role, preferences }) => {
  if (!username || !email || !password || !role) {
    throw { status: 400, message: 'Missing required fields' };
  }

  const existing = await User.findOne({
    where: {
      [Op.or]: [{ username }, { email }]
    }
  });

  if (existing) {
    throw { status: 400, message: 'Username or email already exists' };
  }

  const [roleRow] = await Role.findOrCreate({ where: { name: role } });
  const user = await User.create({
    username,
    email,
    password,
    role_id: roleRow.id,
    preferences: preferences || {}
  });

  const userWithRoles = await User.findByPk(user.id, {
    include: [{ model: Role }]
  });

  return toUserDto(userWithRoles);
};

const updateUser = async (id, { username, email, password, role, preferences }) => {
  const user = await User.findByPk(id, {
    include: [{ model: Role }]
  });

  if (!user) {
    throw { status: 404, message: 'User not found' };
  }

  if (username || email) {
    const existing = await User.findOne({
      where: {
        id: { [Op.ne]: id },
        [Op.or]: [
          username ? { username } : null,
          email ? { email } : null
        ].filter(Boolean)
      }
    });

    if (existing) {
      throw { status: 400, message: 'Username or email already exists' };
    }
  }

  if (username != null) user.username = username;
  if (email != null) user.email = email;
  if (password) user.password = password;

  if (role) {
    const [roleRow] = await Role.findOrCreate({ where: { name: role } });
    user.role_id = roleRow.id;
  }

  if (preferences && typeof preferences === 'object') {
    user.preferences = { ...(user.preferences || {}), ...preferences };
  }

  await user.save();

  const userWithRoles = await User.findByPk(user.id, {
    include: [{ model: Role }]
  });

  return toUserDto(userWithRoles);
};

const updateProfile = async (userId, { fullName, phone }) => {
  const user = await User.findByPk(userId, {
    include: [{ model: Role }]
  });

  if (!user) {
    throw { status: 404, message: 'User not found' };
  }

  if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
    const cleanPhone = String(phone).trim();
    const phoneRegex = /^0[3|5|7|8|9]\d{8}$/;
    if (!phoneRegex.test(cleanPhone)) {
      throw { status: 400, message: 'Invalid phone number. Please check and try again.' };
    }
  }

  const currentPrefs = user.preferences && typeof user.preferences === 'object' ? user.preferences : {};
  user.preferences = {
    ...currentPrefs,
    fullName: fullName !== undefined ? String(fullName).trim() : (currentPrefs.fullName || ''),
    phone: phone !== undefined ? String(phone).trim() : (currentPrefs.phone || '')
  };

  user.changed('preferences', true);
  await user.save();

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.preferences.fullName,
    phone: user.preferences.phone,
    roles: user.Role ? [user.Role.name] : ['user'],
    preferences: user.preferences
  };
};

const getProfile = async (userId) => {
  const user = await User.findByPk(userId, {
    include: [{ model: Role }]
  });

  if (!user) {
    throw { status: 404, message: 'User not found' };
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.preferences?.fullName || '',
    phone: user.preferences?.phone || '',
    roles: user.Role ? [user.Role.name] : ['user'],
    preferences: user.preferences || {}
  };
};

const deleteUser = async (id) => {
  const deletedCount = await User.destroy({ where: { id } });
  if (!deletedCount) {
    throw { status: 404, message: 'User not found' };
  }
  return { success: true };
};

module.exports = {
  listUsers,
  createUser,
  updateUser,
  updateProfile,
  getProfile,
  deleteUser
};
