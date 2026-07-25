ALTER TABLE "GiftCard" ALTER COLUMN "expiresAt" TYPE TIMESTAMP(3)
  USING (CASE WHEN "expiresAt" ~ '^[0-9]{4}$'
    THEN to_date('20' || substr("expiresAt", 3, 2) || substr("expiresAt", 1, 2) || '01', 'YYYYMMDD')
    ELSE NULL END);

ALTER TABLE "ClubMember" ALTER COLUMN "expiresAt" TYPE TIMESTAMP(3)
  USING (CASE WHEN "expiresAt" ~ '^[0-9]{4}$'
    THEN to_date('20' || substr("expiresAt", 3, 2) || substr("expiresAt", 1, 2) || '01', 'YYYYMMDD')
    ELSE NULL END);

ALTER TABLE "Refund" ALTER COLUMN "expiresAt" TYPE TIMESTAMP(3)
  USING (CASE WHEN "expiresAt" ~ '^[0-9]{4}$'
    THEN to_date('20' || substr("expiresAt", 3, 2) || substr("expiresAt", 1, 2) || '01', 'YYYYMMDD')
    ELSE NULL END);

ALTER TABLE "Voucher" ALTER COLUMN "expiresAt" TYPE TIMESTAMP(3)
  USING (CASE WHEN "expiresAt" ~ '^[0-9]{4}$'
    THEN to_date('20' || substr("expiresAt", 3, 2) || substr("expiresAt", 1, 2) || '01', 'YYYYMMDD')
    ELSE NULL END);
