#include <assert.h>
#include <bare.h>
#include <errno.h>
#include <js.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <uv.h>
#include <zmq.h>

typedef struct {
  void *handle;

  atomic_int refs;
} bare_zmq_context_t;

typedef struct {
  void *handle;

  atomic_int refs;
} bare_zmq_socket_t;

typedef struct {
  uv_poll_t handle;
  uv_os_sock_t socket;

  js_env_t *env;
  js_ref_t *ctx;
  js_ref_t *on_poll;
  js_ref_t *on_close;

  js_deferred_teardown_t *teardown;
  bool exiting;
} bare_zmq_poller_t;

static void
bare_zmq__on_context_teardown(void *data) {
  int err;

  bare_zmq_context_t *context = (bare_zmq_context_t *) data;

  if (--context->refs == 0) {
    err = zmq_ctx_shutdown(context->handle);
    assert(err == 0);

    err = zmq_ctx_term(context->handle);
    assert(err == 0);

    free(context);
  }
}

static void
bare_zmq__on_context_finalize(js_env_t *env, void *data, void *finalize_hint) {
  int err;

  bare_zmq__on_context_teardown(data);

  err = js_remove_teardown_callback(env, bare_zmq__on_context_teardown, data);
  assert(err == 0);
}

static js_value_t *
bare_zmq_context_create(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  void *handle = zmq_ctx_new();

  if (handle == NULL) {
    err = zmq_errno();

    err = js_throw_error(env, NULL, zmq_strerror(err));
    assert(err == 0);

    return NULL;
  }

  bare_zmq_context_t *context = malloc(sizeof(bare_zmq_context_t));

  context->handle = handle;
  context->refs = 1;

  err = js_wrap(env, argv[0], context, bare_zmq__on_context_finalize, NULL, NULL);
  assert(err == 0);

  err = js_add_teardown_callback(env, bare_zmq__on_context_teardown, (void *) context);
  assert(err == 0);

  return NULL;
}

static js_value_t *
bare_zmq_context_destroy(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_zmq_context_t *context;
  err = js_remove_wrap(env, argv[0], (void **) &context);
  assert(err == 0);

  err = js_remove_teardown_callback(env, bare_zmq__on_context_teardown, (void *) context);
  assert(err == 0);

  bare_zmq__on_context_teardown((void *) context);

  return NULL;
}

static js_value_t *
bare_zmq_context_serialize(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_zmq_context_t *context;
  err = js_unwrap(env, argv[0], (void **) &context);
  assert(err == 0);

  context->refs++;

  js_value_t *result;
  err = js_create_external(env, (void *) context, NULL, NULL, &result);
  assert(err == 0);

  return result;
}

static js_value_t *
bare_zmq_context_deserialize(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  bare_zmq_context_t *context;
  err = js_get_value_external(env, argv[0], (void **) &context);
  assert(err == 0);

  err = js_wrap(env, argv[1], context, bare_zmq__on_context_finalize, NULL, NULL);
  assert(err == 0);

  err = js_add_teardown_callback(env, bare_zmq__on_context_teardown, (void *) context);
  assert(err == 0);

  return NULL;
}

static void
bare_zmq__on_socket_teardown(void *data) {
  int err;

  bare_zmq_socket_t *socket = (bare_zmq_socket_t *) data;

  if (--socket->refs == 0) {
    err = zmq_close(socket->handle);
    assert(err == 0);

    free(socket);
  }
}

static void
bare_zmq__on_socket_finalize(js_env_t *env, void *data, void *finalize_hint) {
  int err;

  bare_zmq__on_socket_teardown(data);

  err = js_remove_teardown_callback(env, bare_zmq__on_socket_teardown, data);
  assert(err == 0);
}

static js_value_t *
bare_zmq_socket_create(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 3);

  bare_zmq_context_t *context;
  err = js_unwrap(env, argv[1], (void **) &context);
  assert(err == 0);

  int32_t type;
  err = js_get_value_int32(env, argv[2], &type);
  assert(err == 0);

  void *handle = zmq_socket(context->handle, type);

  if (handle == NULL) {
    err = zmq_errno();

    err = js_throw_error(env, NULL, zmq_strerror(err));
    assert(err == 0);

    return NULL;
  }

  bare_zmq_socket_t *socket = malloc(sizeof(bare_zmq_socket_t));

  socket->handle = handle;
  socket->refs = 1;

  err = js_wrap(env, argv[0], (void *) socket, bare_zmq__on_socket_finalize, NULL, NULL);
  assert(err == 0);

  err = js_add_teardown_callback(env, bare_zmq__on_socket_teardown, (void *) socket);
  assert(err == 0);

  return NULL;
}

static js_value_t *
bare_zmq_socket_destroy(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_zmq_socket_t *socket;
  err = js_remove_wrap(env, argv[0], (void **) &socket);
  assert(err == 0);

  err = js_remove_teardown_callback(env, bare_zmq__on_socket_teardown, (void *) socket);
  assert(err == 0);

  bare_zmq__on_socket_teardown((void *) socket);

  return NULL;
}

static js_value_t *
bare_zmq_socket_bind(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  bare_zmq_socket_t *socket;
  err = js_unwrap(env, argv[0], (void **) &socket);
  assert(err == 0);

  size_t endpoint_len;
  err = js_get_value_string_utf8(env, argv[1], NULL, 0, &endpoint_len);
  assert(err == 0);

  endpoint_len += 1 /* NULL */;

  utf8_t *endpoint = malloc(endpoint_len);
  err = js_get_value_string_utf8(env, argv[1], endpoint, endpoint_len, NULL);
  assert(err == 0);

  err = zmq_bind(socket->handle, (const char *) endpoint);

  if (err < 0) {
    err = zmq_errno();

    err = js_throw_error(env, NULL, zmq_strerror(err));
    assert(err == 0);

    return NULL;
  }

  free(endpoint);

  utf8_t assigned[1024];
  size_t assigned_len = 1024;
  err = zmq_getsockopt(socket->handle, ZMQ_LAST_ENDPOINT, assigned, &assigned_len);
  assert(err == 0);

  js_value_t *result;
  err = js_create_string_utf8(env, assigned, assigned_len, &result);
  assert(err == 0);

  return result;
}

static js_value_t *
bare_zmq_socket_connect(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  bare_zmq_socket_t *socket;
  err = js_unwrap(env, argv[0], (void **) &socket);
  assert(err == 0);

  size_t endpoint_len;
  err = js_get_value_string_utf8(env, argv[1], NULL, 0, &endpoint_len);
  assert(err == 0);

  endpoint_len += 1 /* NULL */;

  utf8_t *endpoint = malloc(endpoint_len);
  err = js_get_value_string_utf8(env, argv[1], endpoint, endpoint_len, NULL);
  assert(err == 0);

  err = zmq_connect(socket->handle, (const char *) endpoint);

  if (err < 0) {
    err = zmq_errno();

    err = js_throw_error(env, NULL, zmq_strerror(err));
    assert(err == 0);

    return NULL;
  }

  free(endpoint);

  utf8_t assigned[1024];
  size_t assigned_len = 1024;
  err = zmq_getsockopt(socket->handle, ZMQ_LAST_ENDPOINT, assigned, &assigned_len);
  assert(err == 0);

  js_value_t *result;
  err = js_create_string_utf8(env, assigned, assigned_len, &result);
  assert(err == 0);

  return result;
}

static js_value_t *
bare_zmq_socket_get_option(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 3);

  bare_zmq_socket_t *socket;
  err = js_unwrap(env, argv[0], (void **) &socket);
  assert(err == 0);

  int32_t option;
  err = js_get_value_int32(env, argv[1], &option);
  assert(err == 0);

  size_t len = 0;

  void *data;
  err = js_get_typedarray_info(env, argv[2], NULL, &data, &len, NULL, NULL);
  assert(err == 0);

  err = zmq_getsockopt(socket->handle, option, data, &len);

  if (err < 0) {
    err = zmq_errno();

    err = js_throw_error(env, NULL, zmq_strerror(err));
    assert(err == 0);

    return NULL;
  }

  js_value_t *result;
  err = js_create_int64(env, len, &result);
  assert(err == 0);

  return result;
}

static js_value_t *
bare_zmq_socket_set_option(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 3);

  bare_zmq_socket_t *socket;
  err = js_unwrap(env, argv[0], (void **) &socket);
  assert(err == 0);

  int32_t option;
  err = js_get_value_int32(env, argv[1], &option);
  assert(err == 0);

  size_t len = 0;

  void *data;
  err = js_get_typedarray_info(env, argv[2], NULL, &data, &len, NULL, NULL);
  assert(err == 0);

  err = zmq_setsockopt(socket->handle, option, data, len);

  if (err < 0) {
    err = zmq_errno();

    err = js_throw_error(env, NULL, zmq_strerror(err));
    assert(err == 0);

    return NULL;
  }

  return NULL;
}

static js_value_t *
bare_zmq_message_receive(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_zmq_socket_t *socket;
  err = js_unwrap(env, argv[0], (void **) &socket);
  assert(err == 0);

  zmq_msg_t msg;
  err = zmq_msg_init(&msg);
  assert(err == 0);

  err = zmq_msg_recv(&msg, socket->handle, ZMQ_DONTWAIT);

  js_value_t *result;

  if (err < 0) {
    err = zmq_errno();

    if (err == EAGAIN) {
      err = js_get_null(env, &result);
      assert(err == 0);
    } else {
      result = NULL;

      err = js_throw_error(env, NULL, zmq_strerror(err));
      assert(err == 0);
    }
  } else {
    size_t len = zmq_msg_size(&msg);

    js_value_t *handle;

    void *data;
    err = js_create_arraybuffer(env, len, &data, &handle);
    assert(err == 0);

    memcpy(data, zmq_msg_data(&msg), len);

    js_value_t *more;
    err = js_get_boolean(env, zmq_msg_more(&msg), &more);
    assert(err == 0);

    err = js_create_object(env, &result);
    assert(err == 0);

    err = js_set_named_property(env, result, "data", handle);
    assert(err == 0);

    err = js_set_named_property(env, result, "more", more);
    assert(err == 0);
  }

  err = zmq_msg_close(&msg);
  assert(err == 0);

  return result;
}

static js_value_t *
bare_zmq_message_send(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 3);

  bare_zmq_socket_t *socket;
  err = js_unwrap(env, argv[0], (void **) &socket);
  assert(err == 0);

  size_t len = 0;

  void *data;
  err = js_get_typedarray_info(env, argv[1], NULL, &data, &len, NULL, NULL);
  assert(err == 0);

  int32_t flags;
  err = js_get_value_int32(env, argv[2], &flags);
  assert(err == 0);

  zmq_msg_t msg;
  err = zmq_msg_init_buffer(&msg, data, len);
  assert(err == 0);

  err = zmq_msg_send(&msg, socket->handle, ZMQ_DONTWAIT | flags);

  js_value_t *result;

  if (err < 0) {
    err = zmq_errno();

    if (err == EAGAIN) {
      err = js_get_boolean(env, false, &result);
      assert(err == 0);
    } else {
      result = NULL;

      err = js_throw_error(env, NULL, zmq_strerror(err));
      assert(err == 0);
    }
  } else {
    err = js_get_boolean(env, true, &result);
    assert(err == 0);
  }

  err = zmq_msg_close(&msg);
  assert(err == 0);

  return result;
}

static void
bare_zmq__on_poller_poll(uv_poll_t *handle, int status, int events) {
  int err;

  bare_zmq_poller_t *poller = (bare_zmq_poller_t *) handle;

  js_env_t *env = poller->env;

  js_handle_scope_t *scope;
  err = js_open_handle_scope(env, &scope);
  assert(err == 0);

  js_value_t *ctx;
  err = js_get_reference_value(env, poller->ctx, &ctx);
  assert(err == 0);

  js_value_t *on_poll;
  err = js_get_reference_value(env, poller->on_poll, &on_poll);
  assert(err == 0);

  js_value_t *argv[2];

  if (status < 0) {
    js_value_t *code;
    err = js_create_string_utf8(env, (utf8_t *) uv_err_name(status), -1, &code);
    assert(err == 0);

    js_value_t *message;
    err = js_create_string_utf8(env, (utf8_t *) uv_strerror(status), -1, &message);
    assert(err == 0);

    err = js_create_error(env, code, message, &argv[0]);
    assert(err == 0);
  } else {
    err = js_get_null(env, &argv[0]);
    assert(err == 0);
  }

  err = js_create_int32(env, events, &argv[1]);
  assert(err == 0);

  js_call_function(env, ctx, on_poll, 2, argv, NULL);

  err = js_close_handle_scope(env, scope);
  assert(err == 0);
}

static void
bare_zmq__on_poller_close(uv_handle_t *handle) {
  int err;

  bare_zmq_poller_t *poller = (bare_zmq_poller_t *) handle;

  js_env_t *env = poller->env;

  js_deferred_teardown_t *teardown = poller->teardown;

  js_handle_scope_t *scope;
  err = js_open_handle_scope(env, &scope);
  assert(err == 0);

  js_value_t *ctx;
  err = js_get_reference_value(env, poller->ctx, &ctx);
  assert(err == 0);

  js_value_t *on_close;
  err = js_get_reference_value(env, poller->on_close, &on_close);
  assert(err == 0);

  if (!poller->exiting) js_call_function(env, ctx, on_close, 0, NULL, NULL);

  err = js_close_handle_scope(env, scope);
  assert(err == 0);

  err = js_delete_reference(env, poller->on_poll);
  assert(err == 0);

  err = js_delete_reference(env, poller->ctx);
  assert(err == 0);

  err = js_finish_deferred_teardown_callback(teardown);
  assert(err == 0);
}

static void
bare_zmq__on_poller_teardown(js_deferred_teardown_t *handle, void *data) {
  bare_zmq_poller_t *poller = (bare_zmq_poller_t *) data;

  poller->exiting = true;

  uv_close((uv_handle_t *) &poller->handle, bare_zmq__on_poller_close);
}

static js_value_t *
bare_zmq_poller_create(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 3);

  bare_zmq_socket_t *socket;
  err = js_unwrap(env, argv[0], (void **) &socket);
  assert(err == 0);

  js_value_t *handle;

  bare_zmq_poller_t *poller;
  err = js_create_arraybuffer(env, sizeof(bare_zmq_poller_t), (void **) &poller, &handle);
  assert(err == 0);

  poller->env = env;
  poller->exiting = false;

  size_t len = sizeof(uv_os_sock_t);
  err = zmq_getsockopt(socket->handle, ZMQ_FD, &poller->socket, &len);
  assert(err == 0);

  assert(len == sizeof(uv_os_sock_t));

  uv_loop_t *loop;
  err = js_get_env_loop(env, &loop);
  assert(err == 0);

  err = uv_poll_init_socket(loop, &poller->handle, poller->socket);
  assert(err == 0);

  err = js_create_reference(env, argv[0], 1, &poller->ctx);
  assert(err == 0);

  err = js_create_reference(env, argv[1], 1, &poller->on_poll);
  assert(err == 0);

  err = js_create_reference(env, argv[2], 1, &poller->on_close);
  assert(err == 0);

  err = js_add_deferred_teardown_callback(env, bare_zmq__on_poller_teardown, (void *) poller, &poller->teardown);
  assert(err == 0);

  return handle;
}

static js_value_t *
bare_zmq_poller_update(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  bare_zmq_poller_t *poller;
  err = js_get_arraybuffer_info(env, argv[0], (void **) &poller, NULL);
  assert(err == 0);

  int32_t events;
  err = js_get_value_int32(env, argv[1], &events);
  assert(err == 0);

  err = uv_poll_start(&poller->handle, events, bare_zmq__on_poller_poll);
  assert(err == 0);

  return NULL;
}

static js_value_t *
bare_zmq_poller_close(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  bare_zmq_poller_t *poller;
  err = js_get_arraybuffer_info(env, argv[0], (void **) &poller, NULL);
  assert(err == 0);

  err = uv_poll_stop(&poller->handle);
  assert(err == 0);

  uv_close((uv_handle_t *) &poller->handle, bare_zmq__on_poller_close);

  return NULL;
}

static js_value_t *
bare_zmq_exports(js_env_t *env, js_value_t *exports) {
  int err;

#define V(name, fn) \
  { \
    js_value_t *val; \
    err = js_create_function(env, name, -1, fn, NULL, &val); \
    assert(err == 0); \
    err = js_set_named_property(env, exports, name, val); \
    assert(err == 0); \
  }

  V("createContext", bare_zmq_context_create)
  V("destroyContext", bare_zmq_context_destroy)
  V("serializeContext", bare_zmq_context_serialize)
  V("deserializeContext", bare_zmq_context_deserialize)

  V("createSocket", bare_zmq_socket_create)
  V("destroySocket", bare_zmq_socket_destroy)
  V("bindSocket", bare_zmq_socket_bind)
  V("connectSocket", bare_zmq_socket_connect)
  V("getSocketOption", bare_zmq_socket_get_option)
  V("setSocketOption", bare_zmq_socket_set_option)

  V("receiveMessage", bare_zmq_message_receive)
  V("sendMessage", bare_zmq_message_send)

  V("createPoller", bare_zmq_poller_create)
  V("updatePoller", bare_zmq_poller_update)
  V("closePoller", bare_zmq_poller_close)
#undef V

#define V(name) \
  { \
    js_value_t *val; \
    err = js_create_int32(env, name, &val); \
    assert(err == 0); \
    err = js_set_named_property(env, exports, #name, val); \
    assert(err == 0); \
  }

  V(UV_READABLE);
  V(UV_WRITABLE);

  V(ZMQ_PAIR)
  V(ZMQ_PUB)
  V(ZMQ_SUB)
  V(ZMQ_REQ)
  V(ZMQ_REP)
  V(ZMQ_DEALER)
  V(ZMQ_ROUTER)
  V(ZMQ_PULL)
  V(ZMQ_PUSH)
  V(ZMQ_XPUB)
  V(ZMQ_XSUB)
  V(ZMQ_STREAM)
  V(ZMQ_SERVER)
  V(ZMQ_CLIENT)
  V(ZMQ_RADIO)
  V(ZMQ_DISH)
  V(ZMQ_GATHER)
  V(ZMQ_SCATTER)
  V(ZMQ_DGRAM)
  V(ZMQ_PEER)
  V(ZMQ_CHANNEL)

  V(ZMQ_SNDMORE)

  V(ZMQ_SUBSCRIBE)
  V(ZMQ_UNSUBSCRIBE)
#undef V

  return exports;
}

BARE_MODULE(bare_zmq, bare_zmq_exports)
