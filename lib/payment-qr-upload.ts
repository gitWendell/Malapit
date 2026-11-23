import { RECEIVING_LIMITS } from "./owner-payment-methods";
export async function preparePaymentQr(file: File): Promise<File> {
  if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw new Error("Choose a PNG, JPG or WebP image from your bank or wallet.");
  if(file.size>8*1024*1024)throw new Error("Choose a QR image smaller than 8 MB.");
  let image:ImageBitmap;
  try{image=await createImageBitmap(file);}catch{throw new Error("This image could not be opened. Choose another QR image.");}
  try{
    if(Math.min(image.width,image.height)<96)throw new Error("Choose a clearer QR image, at least 96 pixels per side.");
    const canvas=document.createElement("canvas"),context=canvas.getContext("2d");if(!context)throw new Error("Your browser could not prepare this image.");
    for(const dimension of [RECEIVING_LIMITS.qrDimension,1000,800,640]){
      const scale=Math.min(1,dimension/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
      context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));
      if(blob&&blob.size<=RECEIVING_LIMITS.qrBytes)return new File([blob],"payment-qr.png",{type:"image/png"});
    }
    throw new Error("Crop the image to the QR code, including its white border, then upload it again.");
  }finally{image.close();}
}
