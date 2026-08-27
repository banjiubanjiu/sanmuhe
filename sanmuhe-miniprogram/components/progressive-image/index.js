Component({
  properties: {
    src: {
      type: String,
      value: "",
      observer(value) {
        this.setData({
          loaded: false,
          failed: !value
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
