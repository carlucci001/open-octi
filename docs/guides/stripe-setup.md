# Stripe setup and current public billing scope

Return to **System → Admin → Stripe** whenever you need to configure payments. Only the installation owner can save these keys.

1. Select **Test** or **Live**. Copy the secret and publishable keys from the same Stripe account and mode. Use **Check connection & save keys**. OpenOcti checks the secret key's account access and stores the pair encrypted alongside the installation's other saved keys. It never displays the saved secret. Verify the publishable key belongs to that account during a test checkout.
2. Open the linked Stripe product catalog. Create each product and its one-time or recurring price. Test and live catalogs are separate. OpenOcti's local product definitions do not automatically provision or synchronize Stripe products or prices.
3. Create a Stripe Payment Link using the selected price. A recurring price creates a subscription when a customer completes checkout. Review the customer, payment, and subscription in Stripe Dashboard. This happens in the installation owner's Stripe account, using that account's own products and prices.
4. Test the complete customer checkout before switching to live mode. A working API key alone does not mean Stripe has enabled live charges or that every billing workflow has been tested.

Official guides: [products and prices](https://docs.stripe.com/products-prices/manage-prices), [Payment Links](https://docs.stripe.com/payment-links).

## What is connected inside OpenOcti

- The payment terminal and invoice checkout resolve the owner's saved secret key on each server request.
- Browser payment forms retrieve only the publishable key through an authenticated runtime endpoint. Saving keys does not require rebuilding Docker. Existing forms reset when the saved connection changes.
- App-saved Stripe configuration takes precedence over environment or legacy credential-vault entries. Ambiguous legacy Stripe accounts or test/live pairs require an explicit choice in Admin. Unreadable encrypted configuration refuses fallback or replacement.
- Payment Terminal records a successful payment after its confirmation flow. Invoice checkout stores its Stripe session and reconciles after the customer returns or an operator checks payment status. Configure `INVOICE_BASE_URL` to the public address of this installation for usable invoice return links.

## What is not automatic

This public build does not include in-app Stripe catalog provisioning, subscription creation/management, or signed webhook reconciliation. Payment Link activity and recurring subscription updates are not imported into OpenOcti. The Subscriptions screen tracks vendor expenses; it is not a customer Stripe subscription manager.

If browser checkout is interrupted, check Stripe before retrying a charge. The current payment terminal does not have background recovery for a pending payment intent. Stripe is the source of truth for charges and subscriptions until the complete event-reconciliation integration is implemented and verified.

Never describe entering keys as automatically creating products, prices, subscriptions, or a complete billing lifecycle. Connecting an account, creating an offer, completing checkout, and reconciling the result are separate steps.
