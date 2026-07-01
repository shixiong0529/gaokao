module.exports = {
  apps: [{
    name: 'gaokao-advisor',
    script: 'server.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    watch: false,
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
