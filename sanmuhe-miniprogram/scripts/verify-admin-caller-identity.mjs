/**
 * Regression: web admin identity must not be wiped by empty/anonymous
 * in-function @cloudbase/js-sdk getUserInfo() results.
 *
 * Mirrors getCaller merge rules in manageOperations / manageCatalog.
 */
function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function usableIdentity(value, maxLength = 120) {
  const text = cleanText(value, maxLength);
  if (!text) return "";
  if (/^(anonymous|null|undefined)$/i.test(text)) return "";
  return text;
}

function firstIdentity(...values) {
  for (const value of values) {
    const text = usableIdentity(value);
    if (text) return text;
  }
  return "";
}

function mergeCaller({ contextUser = {}, wxContext = {}, authUserInfo = null } = {}) {
  const nestedUser = contextUser.userInfo && typeof contextUser.userInfo === "object"
    ? contextUser.userInfo
    : {};
  const caller = {
    openid: firstIdentity(wxContext.OPENID, wxContext.FROM_OPENID, contextUser.openId, contextUser.openid),
    uid: firstIdentity(
      contextUser.uid,
      contextUser.userId,
      contextUser.customUserId,
      nestedUser.uid,
      wxContext.TCB_UUID,
      wxContext.UUID
    ),
    username: firstIdentity(contextUser.username, contextUser.name, nestedUser.username)
  };

  if (authUserInfo !== null) {
    const nested = authUserInfo.userInfo && typeof authUserInfo.userInfo === "object"
      ? authUserInfo.userInfo
      : {};
    if (!caller.uid) caller.uid = firstIdentity(authUserInfo.uid, nested.uid);
    if (!caller.username) {
      caller.username = firstIdentity(authUserInfo.username, nested.username, authUserInfo.email, nested.email);
    }
  }
  return caller;
}

/** Broken pre-fix logic for contrast */
function mergeCallerBroken({ contextUser = {}, wxContext = {}, authUserInfo = null } = {}) {
  const caller = {
    openid: wxContext.OPENID || "",
    uid: cleanText(contextUser.uid || contextUser.userId, 120),
    username: cleanText(contextUser.username, 120)
  };
  if (authUserInfo !== null) {
    const userInfo = authUserInfo || {};
    caller.uid = userInfo.uid || (userInfo.userInfo && userInfo.userInfo.uid) || "";
    caller.username = userInfo.username || (userInfo.userInfo && userInfo.userInfo.username) || "";
  }
  return caller;
}

function assertAdmin(caller, whitelist) {
  if (caller.openid && whitelist.openids.includes(caller.openid)) return true;
  if (caller.uid && whitelist.uids.includes(caller.uid)) return true;
  if (caller.username && whitelist.usernames.includes(caller.username)) return true;
  return false;
}

const whitelist = {
  openids: ["oKIOSxIJnzCHtDxNQrsUGWSLbkRM"],
  uids: ["2083743999115059202", "2080915821309370369", "2080914484303536129"],
  usernames: ["admin", "administrator"]
};

const cases = [
  {
    name: "web admin context preserved when auth empty",
    input: {
      contextUser: { uid: "2083743999115059202", username: "admin" },
      authUserInfo: {}
    },
    expectAdmin: true
  },
  {
    name: "web admin context preserved when auth anonymous",
    input: {
      contextUser: { uid: "2083743999115059202", username: "admin" },
      authUserInfo: { uid: "anonymous" }
    },
    expectAdmin: true
  },
  {
    name: "openid path still works",
    input: {
      wxContext: { OPENID: "oKIOSxIJnzCHtDxNQrsUGWSLbkRM" },
      authUserInfo: {}
    },
    expectAdmin: true
  },
  {
    name: "unauthenticated denied",
    input: { authUserInfo: {} },
    expectAdmin: false
  },
  {
    name: "anonymous alone denied",
    input: { authUserInfo: { uid: "anonymous" } },
    expectAdmin: false
  }
];

let failed = 0;
for (const test of cases) {
  const fixed = mergeCaller(test.input);
  const broken = mergeCallerBroken(test.input);
  const fixedOk = assertAdmin(fixed, whitelist) === test.expectAdmin;
  if (!fixedOk) {
    failed += 1;
    console.error(`FAIL ${test.name}: fixed=`, fixed, "admin?", assertAdmin(fixed, whitelist));
  } else {
    console.log(`ok   ${test.name}`);
  }
  // Document that old logic fails the first two cases
  if (test.expectAdmin && test.input.contextUser?.uid && test.input.authUserInfo !== null) {
    const brokenOk = assertAdmin(broken, whitelist);
    if (brokenOk) {
      console.error(`WARN ${test.name}: broken logic unexpectedly passed — regression signal lost`);
    } else {
      console.log(`     (broken logic still red on this case — good signal)`);
    }
  }
}

if (failed) {
  console.error(`\n[verify-admin-caller-identity] ${failed} case(s) failed`);
  process.exit(1);
}
console.log("\n[verify-admin-caller-identity] all cases passed");
