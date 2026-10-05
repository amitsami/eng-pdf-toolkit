# Azure deployment — PDF Toolkit

Website: https://pdfapp67.blackflower-77f2df4c.eastasia.azurecontainerapps.io

## Hosting configuration
- Azure Container Apps, Consumption-only environment, East Asia.
- `TRUST_AZURE_PROXY=1` enables Waitress trusted-proxy parsing for Azure ingress; use only behind that trusted ingress.
- HTTPS enforced; idle হলে scale-to-zero; maximum 1 replica.
- Resources: 1 vCPU / 2 GiB RAM; upload limit: 50 MB; একসঙ্গে 1 conversion.
- Private Azure Container Registry; admin login disabled; managed identity দিয়ে image pull.
- Owner dashboard ও SQLite analytics Azure Files-এর `appdata` share-এ স্থায়ীভাবে থাকে। SQLite DELETE journal mode ও SMB `nobrl` mount option ব্যবহার করে। SQLite-এর জন্য maximum 1 replica বজায় রাখুন; multi-replica দরকার হলে managed database-এ migrate করুন।
- LibreOffice, Ghostscript, Chromium, Tesseract এবং English/Bangla/Hindi/Arabic OCR packages Docker image-এ আছে।

## খরচ ও সীমা
- এটি unlimited বা permanently-free hosting নয়। Free monthly quota ছাড়ালে Student credit ব্যবহার হয়। Registry ও storage-ও credit ব্যবহার করতে পারে।
- Subscription spending limit পরিবর্তন করা হয়নি; paid upgrade করা হয়নি।
- Monthly $10 budget notifications রাখা হয়েছে। Budget notification warning দেয়—এটি hard spending cap নয়।
- Credit balance/expiry Azure portal-এ দেখুন। Credit শেষ হলে service বন্ধ হতে পারে।
- Idle-এর পর প্রথম request cold-start-এর জন্য ধীর হতে পারে। বড়/দীর্ঘ conversion request platform timeout বা memory limit-এ ব্যর্থ হতে পারে।

## Data ও নিরাপত্তা
- Hosted version-এ uploads Azure server-এ process হয়, visitor-এর computer-এ নয়। সাধারণ conversion-এর temporary files request শেষ হলে মুছে যায়। Phone-scan sessions temporary; container restart হলে হারাতে পারে।
- Translation-এ external translation services ব্যবহার হয়। HTML URL conversion public HTTP/HTTPS websites-এর জন্য; local/private/cloud-metadata destinations blocked।
- Visitor analytics IP ও approximate locationসহ তথ্য সংরক্ষণ করে। প্রয়োজনমতো privacy notice ও retention policy ঠিক করুন।
- Owner dashboard-এ নিজের শক্তিশালী password set করুন। Initial credentials public source ZIP-এ রাখা হয়নি।

## Maintain / stop
- Azure portal → Resource groups → `pdfapp-student-rg` → Container App `pdfapp67`.
- Image update করার আগে dependencies ও conversion tools test করুন। Persistent `appdata` volume ও existing identity preserve করুন।
- Hosting আর না চাইলে আগে dashboard/storage data backup করুন, তারপর `pdfapp-student-rg` delete করলে app, registry ও storageসহ সংশ্লিষ্ট resources delete হবে। App একা stop/delete করলে registry/storage-এর খরচ থাকতে পারে।
- Subscription-level `pdfapp-student-alert` budget resource group-এর বাইরে থাকে; প্রয়োজনে আলাদাভাবে delete করুন।
