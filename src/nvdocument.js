import { NVUtilities } from "./nvutilities";
import { NVImageFromUrlOptions, NVIMAGE_TYPE } from "./nvimage";
import { stringify, parse } from "@ungap/structured-clone/json";
import { serialize, deserialize } from "@ungap/structured-clone";
/**
 * Slice Type
 * @enum
 * @readonly
 */
const SLICE_TYPE = Object.freeze({
  AXIAL: 0,
  CORONAL: 1,
  SAGITTAL: 2,
  MULTIPLANAR: 3,
  RENDER: 4,
});

/**
 * @class NVDocument
 * @type NVDocument
 * @constructor
 */
export class NVDocument {
  constructor() {
    this.data = {};
    this.data.title = "Untitled document";
    this.data.renderAzimuth = 110; //-45;
    this.data.renderElevation = 10; //-165; //15;
    this.data.crosshairPos = [0.5, 0.5, 0.5];
    this.data.clipPlane = [0, 0, 0, 0];
    this.data.sliceType = SLICE_TYPE.AXIAL;
    this.data.imageOptionsArray = [];
    this.data.meshOptionsArray = [];

    this.volumes = [];
    this.meshes = [];
    this.drawBitmap = null;
    this.imageOptionsMap = new Map();
    this.meshOptionsMap = new Map();
  }

  get title() {
    return this.data.title;
  }
  /**
   * @param {string} title title of document
   */
  set title(title) {
    this.data.title = title;
  }

  get imageOptionsArray() {
    return this.data.imageOptionsArray;
  }

  get meshOptionsArray() {
    return this.data.meshOptionsArray;
  }

  get renderAzimuth() {
    return this.data.renderAzimuth;
  }

  set renderAzimuth(azimuth) {
    this.data.renderAzimuth = azimuth;
  }

  get renderElevation() {
    return this.data.renderElevation;
  }

  set renderElevation(elevation) {
    this.data.renderElevation = elevation;
  }

  get crosshairPos() {
    return this.data.crosshairPos;
  }

  set crosshairPos(pos) {
    this.data.crosshairPos = pos;
  }

  get clipPlane() {
    return this.data.clipPlane;
  }

  set clipPlane(plane) {
    this.data.clipPlane = plane;
  }

  get sliceType() {
    return this.data.sliceType;
  }

  set sliceType(sliceType) {
    this.data.sliceType = sliceType;
  }

  get encodedImageBlobs() {
    return this.data.encodedImageBlobs;
  }

  get encodedDrawingBlob() {
    return this.data.encodedDrawingBlob;
  }

  hasImage(image) {
    return this.volumes.find((i) => i.id === image.id);
  }

  hasImageFromUrl(url) {
    return this.data.imageOptionsArray.find((i) => i.url === url);
  }

  addImageOptions(image, imageOptions) {
    if (!this.hasImage(image)) {
      if (!imageOptions.name) {
        if (imageOptions.url) {
          let absoluteUrlRE = new RegExp("^(?:[a-z+]+:)?//", "i");
          let url = absoluteUrlRE.test(imageOptions.url)
            ? new URL(imageOptions.url)
            : new URL(imageOptions.url, window.location.href);

          imageOptions.name = url.pathname.split("/").pop();
          if (imageOptions.name.toLowerCase().endsWith(".gz")) {
            imageOptions.name = imageOptions.name.slice(0, -3);
          }

          if (!imageOptions.name.toLowerCase().endsWith(".nii")) {
            imageOptions.name += ".nii";
          }
        } else {
          imageOptions.name = "untitled.nii";
        }
      }
      imageOptions.imageType = NVIMAGE_TYPE.NII;

      this.data.imageOptionsArray.push(imageOptions);
      this.imageOptionsMap.set(
        image.id,
        this.data.imageOptionsArray.length - 1
      );
    }
  }

  removeImage(image) {
    if (this.imageOptionsMap.has(image.id)) {
      let index = this.imageOptionsMap.get(image.id);
      if (this.data.imageOptionsArray.length > index) {
        this.data.imageOptionsArray.splice(index, 1);
      }
      this.imageOptionsMap.delete(image.id);
    }
    this.volumes = this.volumes.filter((i) => i.id != image.id);
  }

  getImageOptions(image) {
    return this.imageOptionsMap.has(image.id)
      ? this.data.imageOptionsArray[this.imageOptionsMap.get(image.id)]
      : null;
  }

  async save(fileName) {
    let imageOptionsArray = [];
    this.data.encodedImageBlobs = [];
    this.data.encodedDrawingBlob = null;
    this.data.imageOptionsMap = [];

    // check for our base layer
    if (this.volumes.length == 0 && this.meshes.length == 0) {
      throw new Error("nothing to save");
    }

    if (this.volumes.length) {
      let imageOptions = this.imageOptionsArray[0];
      if (imageOptions) {
        imageOptionsArray.push(imageOptions);
        let encodedImageBlob = NVUtilities.uint8tob64(
          this.volumes[0].toUint8Array()
        );
        this.data.encodedImageBlobs.push(encodedImageBlob);
        if (this.drawBitmap) {
          this.data.encodedDrawingBlob = NVUtilities.uint8tob64(
            this.volumes[0].toUint8Array(this.drawBitmap)
          );
        }

        this.data.imageOptionsMap.push([this.volumes[0].id, 0]);
      } else {
        throw new Error("image options for base layer not found");
      }

      for (let i = 1; i < this.volumes.length; i++) {
        const volume = this.volumes[i];
        let imageOptions = this.getImageOptions(volume);
        if (!imageOptions) {
          imageOptions = {
            name: "",
            colorMap: "gray",
            opacity: 1.0,
            pairedImgData: null,
            cal_min: NaN,
            cal_max: NaN,
            trustCalMinMax: true,
            percentileFrac: 0.02,
            ignoreZeroVoxels: false,
            visible: true,
            isDICOMDIR: false,
            useQFormNotSForm: false,
            colorMapNegative: "",
            imageType: NVIMAGE_TYPE.NII,
          };
        }
        // update image options on current image settings
        imageOptions.colorMap = volume.colorMap;
        imageOptions.opacity = volume.opacity;

        imageOptionsArray.push(imageOptions);

        let encodedImageBlob = NVUtilities.uint8tob64(
          await volume.toUint8Array()
        );
        this.data.encodedImageBlobs.push(encodedImageBlob);
        this.data.imageOptionsMap.push([volume.id, i]);
      }
      this.data.imageOptionsArray = imageOptionsArray;
    }

    const meshes = [];
    for (const mesh of this.meshes) {
      const copyMesh = {};
      copyMesh.pts = mesh.pts;
      copyMesh.tris = mesh.tris;
      copyMesh.name = mesh.name;
      copyMesh.rgba255 = mesh.rgba255;
      copyMesh.opacity = mesh.opacity;
      copyMesh.connectome = mesh.connectome;
      copyMesh.dpg = mesh.dpg;
      copyMesh.dps = mesh.dps;
      copyMesh.dpv = mesh.dpv;

      copyMesh.meshShaderIndex = mesh.meshShaderIndex;
      copyMesh.layers = [];

      for (const layer of mesh.layers) {
        const copyLayer = {};
        copyLayer.values = layer.values;
        copyLayer.nFrame4D = layer.nFrame4D;
        copyLayer.frame4D = 0;
        copyLayer.isOutlineBorder = layer.isOutlineBorder;
        copyLayer.global_min = layer.global_min;
        copyLayer.global_max = layer.global_max;
        copyLayer.cal_min = layer.cal_min;
        copyLayer.cal_max = layer.cal_max;
        copyLayer.opacity = layer.opacity;
        copyLayer.colorMap = layer.colorMap;
        copyLayer.colorMapNegative = layer.colorMapNegative;
        copyLayer.useNegativeCmap = layer.useNegativeCmap;
        copyMesh.layers.push(copyLayer);
      }

      meshes.push(copyMesh);
    }
    this.data.meshesString = JSON.stringify(serialize(meshes));

    NVUtilities.download(
      JSON.stringify(this.data),
      fileName,
      "application/json"
    );
  }

  /**
   * Factory method to return an instance of NVDocument
   * @param {string} url
   * @constructs NVDocument
   */
  static async loadFromUrl(url) {
    let document = new NVDocument();
    let response = await fetch(url);
    document.data = await response.json();
    if (document.data.meshesString) {
      document.meshes = deserialize(JSON.parse(document.data.meshesString));
      delete document.data["meshesString"];
    }
    return document;
  }

  /**
   * Factory method to return an instance of NVDocument
   * @param {File} file
   * @constructs NVDocument
   */
  static async loadFromFile(file) {
    let arrayBuffer = await NVUtilities.readFileAsync(file);
    let document = new NVDocument();
    let utf8decoder = new TextDecoder();
    let dataString = utf8decoder.decode(arrayBuffer);
    document.data = JSON.parse(dataString);
    if (document.data.meshesString) {
      document.meshes = deserialize(JSON.parse(document.data.meshesString));
      delete document.data["meshesString"];
    }

    return document;
  }
}
