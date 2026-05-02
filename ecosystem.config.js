module.exports = {
  apps: [
    {
      name: 'polyglot',
      script: './src/server.js',
      cwd: '/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot',
      interpreter: 'node',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      kill_timeout: 5000,
      // Q41: exec_mode cluster for zero-downtime reload (pm2 reload polyglot)
      exec_mode: 'fork', // keep fork for SQLite (cluster mode would open multiple DB connections)
      // Q48: increase Node memory limit for large agent workloads
      node_args: '--max-old-space-size=512',
      env: {
        NODE_ENV: 'production',
        PORT: 3847,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3847,
      },
      error_file: '/Users/yashbaldha/.pm2/logs/polyglot-error.log',
      out_file: '/Users/yashbaldha/.pm2/logs/polyglot-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Q49: PM2 log rotation (requires pm2-logrotate module)
      // pm2 install pm2-logrotate
      // pm2 set pm2-logrotate:max_size 10M
      // pm2 set pm2-logrotate:retain 7
    },
  ],
}
