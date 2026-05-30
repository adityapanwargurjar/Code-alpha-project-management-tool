const knex = require('knex')({
  client: 'sqlite3',
  connection: { filename: './management.sqlite' },
  useNullAsDefault: true
});

async function initDB() {
  // 1. Users
  if (!await knex.schema.hasTable('users')) {
    await knex.schema.createTable('users', table => {
      table.increments('id').primary();
      table.string('username').unique().notNullable();
    });
    await knex('users').insert([{ username: 'Alex' }, { username: 'Blake' }, { username: 'Charlie' }]);
  }

  // 2. Projects
  if (!await knex.schema.hasTable('projects')) {
    await knex.schema.createTable('projects', table => {
      table.increments('id').primary();
      table.string('name').notNullable();
    });
  }

  // 3. Project Members (Junction table for collaborative group projects)
  if (!await knex.schema.hasTable('project_members')) {
    await knex.schema.createTable('project_members', table => {
      table.integer('project_id').references('projects.id').onDelete('CASCADE');
      table.integer('user_id').references('users.id').onDelete('CASCADE');
      table.primary(['project_id', 'user_id']);
    });
  }

  // 4. Tasks
  if (!await knex.schema.hasTable('tasks')) {
    await knex.schema.createTable('tasks', table => {
      table.increments('id').primary();
      table.integer('project_id').references('projects.id').onDelete('CASCADE');
      table.string('title').notNullable();
      table.string('status').defaultTo('Todo'); // Todo, InProgress, Done
      table.integer('assigned_to').references('users.id').nullable();
    });
  }

  // 5. Comments
  if (!await knex.schema.hasTable('comments')) {
    await knex.schema.createTable('comments', table => {
      table.increments('id').primary();
      table.integer('task_id').references('tasks.id').onDelete('CASCADE');
      table.integer('user_id').references('users.id');
      table.text('content').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  console.log('Database schema successfully synchronized.');
}

initDB();
module.exports = knex;
