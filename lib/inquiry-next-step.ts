import type { Inquiry } from './types';
export type InquiryNextStep = { stage: number; title: string; description: string; rentalAction: string; hasRental: boolean };
export function inquiryNextStep(item: Inquiry, userId: string): InquiryNextStep | null {
  if(item.isDemo || ![item.ownerId,item.renterId].includes(userId))return null;
  const owner=item.ownerId===userId,rental=item.rental,viewing=item.viewing;
  if(rental?.status==='pending')return {stage:2,title:owner?'Waiting for the renter to review':'Your rental details are ready',description:owner?'The renter reviews the agreed rent, dates and first bill. Their bill opens after they accept.':'Review the agreed rent, dates and first bill. Accepting adds this place to My Rentals.',rentalAction:owner?'View rental setup':'Review and accept rental',hasRental:true};
  if(rental?.status==='ended')return {stage:3,title:'This rental has ended',description:'Your original rental and payment records remain available. Check the bill for any remaining balance.',rentalAction:'View rental records',hasRental:true};
  if(rental?.status==='accepted'){
    if(rental.billStatus==='issued'&&rental.remainingCents===0)return{stage:4,title:'This rent bill is paid',description:'The owner confirmed receipt for this bill. Your payment record is in My Rentals.',rentalAction:'View payment record',hasRental:true};
    if(rental.pendingPayment)return{stage:3,title:owner?'A payment report needs your review':'Waiting for payment confirmation',description:owner?'Check your own bank or wallet records, then confirm receipt or ask for a correction.':'Your report is with the owner. The balance changes after they confirm receipt.',rentalAction:owner?'Review payment report':'View payment status',hasRental:true};
    return{stage:3,title:'Your rental is connected',description:owner?'Open the rent bill to see its balance and payment records.':'Open the bill, choose the owner’s payment option and report your payment after sending it.',rentalAction:owner?'View rent bill':'Open rent bill',hasRental:true};
  }
  if(viewing?.status==='completed')return{stage:2,title:'Viewing complete. Agree the rental details.',description:owner?'When you have both agreed to rent, send the renter the rent, dates and first bill.':'Discuss the rent and dates with the owner. They can then send rental details for you to review.',rentalAction:'Set up rental',hasRental:false};
  if(viewing?.status==='confirmed')return{stage:1,title:'Your viewing is confirmed',description:'Check the agreed time and private meeting note below. You can suggest another time if plans change.',rentalAction:'Set up rental',hasRental:false};
  if(viewing?.status==='proposed')return{stage:1,title:viewing.proposedBy===userId?'Your viewing request is waiting':'A viewing time needs your reply',description:viewing.proposedBy===userId?'The other person needs to confirm this time. You can suggest another time or cancel.':'Confirm the proposed time, suggest another time, or decline. All times are Philippine time.',rentalAction:'Set up rental',hasRental:false};
  return{stage:1,title:viewing?'Choose another viewing time':'Arrange a viewing',description:'Suggest a time to see the property. A viewing is optional if you have already agreed to rent.',rentalAction:'Set up rental',hasRental:false};
}
