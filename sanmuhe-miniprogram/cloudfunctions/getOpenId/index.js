const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event) => {
  const { OPENID, APPID, UNIONID } = cloud.getWXContext();

  return {
    ok: true,
    openid: OPENID,
    appid: APPID,
    unionid: UNIONID || "",
    input: event || {}
  };
};
