const { AsyncLocalStorage } = require("async_hooks");

const requestContext = new AsyncLocalStorage();

function runWithRequestActor(actor, callback) {
  return requestContext.run({ actor: actor || null }, callback);
}

function getRequestActor() {
  return requestContext.getStore()?.actor || null;
}

function getActorScopeKey(actor = getRequestActor()) {
  if (!actor) return "system";
  if (actor.isAdmin) return `admin:${actor.userId}`;
  return `owner:${actor.userId}`;
}

module.exports = {
  runWithRequestActor,
  getRequestActor,
  getActorScopeKey,
};
