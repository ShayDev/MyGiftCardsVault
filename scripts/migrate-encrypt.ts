import prisma from '../lib/prisma'
import { encrypt, isEncrypted } from '../lib/encrypt'

async function main() {
  let cardCount = 0
  let voucherCount = 0

  const cards = await prisma.giftCard.findMany()
  for (const card of cards) {
    const update: Record<string, string> = {}
    if (card.fullNumber && !isEncrypted(card.fullNumber)) update.fullNumber = encrypt(card.fullNumber)
    if (card.cvv        && !isEncrypted(card.cvv))        update.cvv        = encrypt(card.cvv)
    if (card.link       && !isEncrypted(card.link))       update.link       = encrypt(card.link)
    if (Object.keys(update).length) {
      await prisma.giftCard.update({ where: { id: card.id }, data: update })
      console.log(`encrypted card ${card.seq} (${card.id}): ${Object.keys(update).join(', ')}`)
      cardCount++
    }
  }

  const vouchers = await prisma.voucher.findMany()
  for (const v of vouchers) {
    const update: Record<string, string> = {}
    if (v.code && !isEncrypted(v.code)) update.code = encrypt(v.code)
    if (v.link && !isEncrypted(v.link)) update.link = encrypt(v.link)
    if (Object.keys(update).length) {
      await prisma.voucher.update({ where: { id: v.id }, data: update })
      console.log(`encrypted voucher ${v.seq} (${v.id}): ${Object.keys(update).join(', ')}`)
      voucherCount++
    }
  }

  console.log(`\ndone — ${cardCount} card(s) and ${voucherCount} voucher(s) encrypted`)
}

main().catch(console.error)
