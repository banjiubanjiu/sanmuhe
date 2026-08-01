const {
  agreePrivacyAuthorization,
  disagreePrivacyAuthorization,
  openPrivacyContract
} = require("../../utils/privacy");

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    purpose: {
      type: String,
      value: ""
    },
    contractName: {
      type: String,
      value: "用户隐私保护指引"
    }
  },

  methods: {
    noop() {},

    openContract() {
      openPrivacyContract();
    },

    /**
     * 必须在 open-type="agreePrivacyAuthorization" 的回调里同步 resolve。
     * 经 triggerEvent 抛到页面再 resolve 会导致 buttonId 校验失败，
     * 挂起的 chooseAddress 等接口只会报「需同意隐私协议」。
     */
    agree() {
      agreePrivacyAuthorization();
      this.triggerEvent("agree");
    },

    cancel() {
      disagreePrivacyAuthorization();
      this.triggerEvent("cancel");
    }
  }
});
