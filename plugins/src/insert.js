'use strict';

const utils = require('./common/utils');
const common = require('./common/writes');

const {r} = require('@horizon/server');

function insert(server) {
  return (request, response, next) => {
    const conn = server.rdb_connection().connection();
    const timeout = request.getParameter('timeout');
    const collection = request.getParameter('collection');
    const permissions = request.getParameter('hz_permissions');

    if (!collection) {
      throw new Error('No collection given for insert operation.');
    } else if (!permissions) {
      throw new Error('No permissions given for insert operation.');
    }

    common.retry_loop(request.options.insert, permissions, timeout,
      (rows) => // pre-validation, all rows
        Array(rows.length).fill(null),
      (validator, row, info) => { // validation, each row
        if (!validator(request.clientCtx, info, row)) {
          return new Error(common.unauthorized_msg);
        }
      },
      (rows) => // write to database, all valid rows
        collection.table
          .insert(rows.map((row) => common.apply_version(r.expr(row), 0)),
                  {returnChanges: 'always'})
          .run(conn, utils.reqlOptions)
    ).then((msg) => response.end(msg)).catch(next);
  };
}

module.exports = () => ({
  name: 'hz_insert',
  activate: (ctx) => ({
    methods: {
      insert: {
        type: 'terminal',
        requires: ['hz_permissions'],
        handler: insert(ctx),
      },
    },
  }),
});