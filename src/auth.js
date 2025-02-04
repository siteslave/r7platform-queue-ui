const { FastifyAdapter } = require('@bull-board/fastify');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');

const pointOfView = require('@fastify/view');
const path = require('path');

module.exports.authen = function authen(fastify, { queue }, next) {

  const SUPER_SECRET_KEY = process.env.R7PLATFORM_QUEUEUI_SUPER_SECRET_KEY || '';
  const SECRET_KEY = process.env.R7PLATFORM_QUEUEUI_SECRET_KEY || '';


  fastify.register(require('@fastify/cookie'), {
    secret: SECRET_KEY,
  });

  fastify.register(require('@fastify/jwt'), {
    secret: SUPER_SECRET_KEY,
    cookie: {
      cookieName: 'token',
    },
  });

  fastify.after(() => {
    const serverAdapter = new FastifyAdapter();

    let queues = []
    queue.forEach(q => {
      queues.push(new BullMQAdapter(q));
    });

    const basePath = process.env.R7PLATFORM_QUEUEUI_BASE_PATH || '/queues'

    const urlBasePath = `${basePath}/ui`
    serverAdapter.setBasePath(urlBasePath)

    fastify.register(serverAdapter.registerPlugin(), {
      prefix: basePath + '/ui'
    });

    createBullBoard({
      queues: queues,
      serverAdapter,
      options: {
        uiConfig: {
          boardTitle: 'R7 Queues',
        },
      }
    });

    fastify.register(pointOfView, {
      engine: {
        ejs: require('ejs'),
      },
      root: path.join(__dirname, './views'),
    });

    fastify.route({
      method: 'GET',
      url: '/',
      handler: (req, reply) => {
        reply.redirect(urlBasePath);
      },
    });

    fastify.route({
      method: 'GET',
      url: basePath + '/login',
      handler: (req, reply) => {
        reply.view('login.ejs');
      },
    });

    fastify.route({
      method: 'POST',
      url: basePath + '/login',
      handler: async (req, reply) => {
        const { username = '', password = '' } = req.body;
        if (username === process.env.R7PLATFORM_QUEUEUI_UI_USERNAME || 'bullr7' && password === process.env.R7PLATFORM_QUEUEUI_UI_PASSWORD || 'board@r7') {
          const token = await reply.jwtSign({
            name: 'r7admin',
            role: ['admin'],
          });

          reply
            .setCookie('token', token, {
              path: '/',
              secure: false, // send cookie over HTTPS only
              httpOnly: true,
              sameSite: true, // alternative CSRF protection
            })
            .send({ success: true, url: `${basePath}/ui` });
        } else {
          reply.code(401).send({ error: 'invalid_username_password' });
        }
      },
    });

    fastify.addHook('preHandler', async (request, reply) => {
      const url = basePath + '/login';
      if (request.url === url) {
        return;
      }

      try {
        await request.jwtVerify();
      } catch (error) {
        const url = basePath + '/login'
        reply.redirect(url);
      }
    });
  });

  next();
};