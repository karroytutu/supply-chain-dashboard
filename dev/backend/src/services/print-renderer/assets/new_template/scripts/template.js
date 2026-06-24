/*
 * @Description:
 * @Company: zhoupudata
 * @Author: ljh
 * @Date: 2023-12-12 16:56:04
 * @LastEditors: ljh
 * @LastEditTime: 2023-12-22 10:17:59
 */
function renderBarcode(){
  try {
    JsBarcode(".barcode").init({
      valid: (valid) => {
        console.log(valid);
      },
    });
  } catch (error) {
    console.log(error);
  }
}
function renderQrcode() {
  try {
    const qrcodeNodes = document.querySelectorAll(".qrcode");
    for (const node of qrcodeNodes) {
      const value = node.dataset.value;
      const icon = node.dataset.icon;
      const level = node.dataset.level;
      const qrSVG = new QRCODE.QRCodeSVG(value, {
        level: level,
        image: {
          source: icon,
          width: "20%",
          height: "20%",
          x: "center",
          y: "center",
        },
      });
      node.innerHTML = qrSVG.toString();
    }
  } catch (error) {
    console.log(error);
  }
}
