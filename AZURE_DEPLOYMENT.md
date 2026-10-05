# Azure Deployment — PDF Toolkit

Website: https://pdfapp67.blackflower-77f2df4c.eastasia.azurecontainerapps.io

## Hosting Configuration

- Azure Container Apps in a Consumption-only environment in East Asia.
- `TRUST_AZURE_PROXY=1` enables Waitress trusted-proxy parsing for Azure ingress. Use this setting only behind that trusted ingress.
- HTTPS is enforced. The app scales to zero when idle, with a maximum of one replica.
- Resources: 1 vCPU and 2 GiB RAM. Upload limit: 50 MB. One conversion runs at a time.
- The Azure Container Registry is private, with administrator login disabled. A managed identity pulls the image.
- Owner configuration and SQLite analytics persist in the Azure Files `appdata` share. SQLite uses DELETE journal mode, and the SMB mount uses `nobrl`. Keep the maximum at one replica for this SQLite configuration; migrate to a managed database before using multiple replicas.
- The Docker image includes LibreOffice, Ghostscript, Chromium, Tesseract, and English, Bengali, Hindi, and Arabic OCR packages.

## Costs and Limits

- Hosting is not unlimited or permanently free. Usage beyond the monthly free allowance consumes Student credit. The registry and storage can also consume credit.
- The subscription spending limit was not changed, and the subscription was not upgraded to a paid plan.
- Monthly $10 budget notifications were configured. Budget notifications are warnings, not a hard spending cap.
- Check your credit balance and expiration in the Azure portal. Services may stop when credit runs out.
- The first request after an idle period may be slower because of a cold start. Large or long-running conversions may fail because of platform timeouts or memory limits.

## Data and Security

- Hosted uploads are processed on the Azure server, not on the visitor's computer. Temporary files for ordinary conversions are removed after the request finishes. Phone-scan sessions are temporary and may be lost when the container restarts.
- Translation uses external translation services. HTML URL conversion accepts public HTTP/HTTPS websites; local, private-network, and cloud-metadata destinations are blocked.
- Visitor analytics retain information including IP addresses and approximate locations. Configure an appropriate privacy notice and retention policy.
- Set a strong password for the owner dashboard. Initial credentials are not included in the public source archive or repository.

## Maintenance and Shutdown

- Open **Azure portal → Resource groups → `pdfapp-student-rg` → Container App `pdfapp67`**.
- Test dependencies and conversion tools before updating the image. Preserve the persistent `appdata` volume and existing identity.
- If hosting is no longer needed, back up dashboard and storage data first. Deleting `pdfapp-student-rg` then deletes the app, registry, storage, and other resources in that group. Stopping or deleting only the app may leave registry and storage costs.
- The subscription-level `pdfapp-student-alert` budget is outside the resource group and must be deleted separately if no longer needed.
