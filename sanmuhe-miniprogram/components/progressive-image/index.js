const loadedImageSources = new Set();

Component({
  properties: {
    src: {
      type: String,
      value: "",
      observer(value) {
        const source = String(value || "");
        this.setData({
          loaded: !!source && loadedImageSources.has(source),
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
      const source = String(this.data.src || "");
      if (source) {
        loadedImageSources.add(source);
      }
      this.setData({ loaded: true, failed: false });
      this.triggerEvent("load", event.detail || {});
    },

    handleError(event) {
      const source = String(this.data.src || "");
      if (source) {
        loadedImageSources.delete(source);
      }
      this.setData({ loaded: false, failed: true });
      this.triggerEvent("error", event.detail || {});
    }
  }
});
