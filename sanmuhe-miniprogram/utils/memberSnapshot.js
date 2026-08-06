/**
 * 「我的」/ 会员中心共用：上次会员态快照，减少接口返回前的非会员闪烁
 */
const MEMBER_SNAPSHOT_KEY = "sanmuhe_profile_member_v1";

const defaultUser = {
  name: "禾煦茶友",
  title: "愿你在此，得一盏清欢"
};

const defaultMember = {
  isMember: false,
  name: "禾煦茶友",
  tier: "普通顾客",
  cardNo: "",
  points: 0,
  coupons: 0,
  orders: 0,
  balance: "0.00",
  phoneMasked: ""
};

function readMemberSnapshot() {
  try {
    const raw = wx.getStorageSync(MEMBER_SNAPSHOT_KEY);
    if (!raw || typeof raw !== "object") {
      return null;
    }
    return {
      user: raw.user && typeof raw.user === "object" ? raw.user : null,
      member: raw.member && typeof raw.member === "object" ? raw.member : null,
      wallet: raw.wallet && typeof raw.wallet === "object" ? raw.wallet : null
    };
  } catch (error) {
    return null;
  }
}

function writeMemberSnapshot(payload = {}) {
  try {
    const member = payload.member || {};
    const user = payload.user || {};
    const wallet = payload.wallet || {};
    const prev = readMemberSnapshot() || {};
    wx.setStorageSync(MEMBER_SNAPSHOT_KEY, {
      user: {
        name: user.name || (prev.user && prev.user.name) || defaultUser.name,
        title: user.title || (prev.user && prev.user.title) || defaultUser.title,
        avatar: user.avatar || (prev.user && prev.user.avatar) || ""
      },
      member: {
        isMember: !!member.isMember,
        name: member.name || defaultMember.name,
        tier: member.tier || defaultMember.tier,
        cardNo: member.cardNo || defaultMember.cardNo,
        points: Number(member.points) || 0,
        coupons: Number(member.coupons) || 0,
        orders: Number(member.orders) || 0,
        balance: member.balance != null ? String(member.balance) : defaultMember.balance,
        phoneMasked: member.phoneMasked || defaultMember.phoneMasked,
        discountRate: member.discountRate
      },
      wallet: {
        balance: wallet.balance != null ? String(wallet.balance) : (member.balance || "0.00"),
        principalBalance: wallet.principalBalance != null ? String(wallet.principalBalance) : "0.00",
        bonusBalance: wallet.bonusBalance != null ? String(wallet.bonusBalance) : "0.00",
        enabled: wallet.enabled === true
      },
      savedAt: Date.now()
    });
  } catch (error) {
    // ignore storage errors
  }
}

/**
 * 会员中心首屏：有缓存则直接展示，避免先闪「开通」区
 */
function buildMemberPageBootstrap(baseMember, emptyWallet) {
  const snap = readMemberSnapshot();
  if (snap && snap.member && snap.member.isMember) {
    const m = Object.assign({}, baseMember, {
      isMember: true,
      name: snap.member.name || baseMember.name,
      tier: snap.member.tier || baseMember.tier,
      cardNo: snap.member.cardNo || baseMember.cardNo,
      points: snap.member.points != null ? snap.member.points : baseMember.points,
      phoneMasked: snap.member.phoneMasked || "",
      discountRate: snap.member.discountRate != null ? snap.member.discountRate : baseMember.discountRate
    });
    const w = Object.assign({}, emptyWallet, {
      balance: (snap.wallet && snap.wallet.balance) || snap.member.balance || "0.00",
      principalBalance: (snap.wallet && snap.wallet.principalBalance) || "0.00",
      bonusBalance: (snap.wallet && snap.wallet.bonusBalance) || "0.00",
      enabled: true
    });
    return {
      member: m,
      wallet: w,
      memberStatusReady: true
    };
  }
  if (snap && snap.member && snap.member.isMember === false && snap.savedAt) {
    // 明确非会员缓存：也可直接展示开通区
    return {
      member: Object.assign({}, baseMember, { isMember: false }),
      wallet: emptyWallet,
      memberStatusReady: true
    };
  }
  return {
    member: Object.assign({}, baseMember),
    wallet: emptyWallet,
    memberStatusReady: false
  };
}

module.exports = {
  MEMBER_SNAPSHOT_KEY,
  defaultUser,
  defaultMember,
  readMemberSnapshot,
  writeMemberSnapshot,
  buildMemberPageBootstrap
};
