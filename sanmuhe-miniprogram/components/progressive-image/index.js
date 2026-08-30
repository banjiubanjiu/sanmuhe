Component({
  properties: {
    src: {
      type: String,
      value: "",
      observer(value) {
        const source = String(value || "");
        this.setData({
          // 只以当前 image 的 bindload 为准，不能把“曾加载过”误当成已经绘制。
          loaded: false,
          failed: !source
        });
      }
    },
    mode: {
      type: String,
      value: "aspectFill"
    },
    lazyLoad: {
      type: Boolean,
      value: true
    },
    webp: {
      type: Boolean,
      value: false
    },
    ariaLabel: {
      type: String,
      value: ""
    },
    previewSrc: {
      type: String,
      value: ""
    },
    fallbackSrc: {
      type: String,
      value: "/assets/icons/leaf-active.png"
    }
  },

  data: {
    loaded: false,
    failed: false
  },

  methods: {
    handleLoad(event) {
      this.setData({ loaded: true, failed: false });
      this.triggerEvent("load", event.detail || {});
    },

    handleError(event) {
      this.setData({ loaded: false, failed: true });
      this.triggerEvent("error", event.detail || {});
    }
  }
});
