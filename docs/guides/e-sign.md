# E-signature

OpenOcti creates random signing tokens, stores only token hashes, records consent and an audit trail, and can deliver signing links through Resend.

To enable it:

1. Set `SIGNING_PUBLIC_URL` to the public HTTPS origin where signers can reach OpenOcti.
2. Set `RESEND_API_KEY` and a verified `RESEND_FROM` identity.
3. Restart the app and open Documents → E-Signatures.
4. Create or select a signature-ready document, verify the signer, and request the signature.

Until both required settings exist, the page says **Not configured — add SIGNING_PUBLIC_URL and RESEND_API_KEY to enable e-signature**, and the document and agent signing paths refuse to create a request.

Treat the audit trail as business evidence, not a substitute for legal advice about signature requirements in a particular jurisdiction.
