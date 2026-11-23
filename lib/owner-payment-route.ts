import { rentalError } from "./rentals-server";
export const paymentDetailsHeaders={"Cache-Control":"private, no-store"};
export function paymentDetailsError(error:unknown){const response=rentalError(error);response.headers.set("Cache-Control","private, no-store");return response;}
