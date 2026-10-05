# Hugging Face-এ ENG PDF Toolkit চালানোর গাইড

1. huggingface.co → Sign Up (ইমেইল ভেরিফাই করুন)
2. ডান উপরে প্রোফাইল ছবি → **New Space**
   - Space name: `eng-pdf`
   - License: MIT (বা যেকোনো)
   - SDK: **Docker** → Template: **Blank**
   - Hardware: **CPU basic · FREE**
   - Visibility: **Public**
   - **Create Space**
3. Space-এর **Settings → Variables and secrets → New secret**
   - `OWNER_PASSWORD` = আপনার ড্যাশবোর্ড পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)
   - `OWNER_PATH` = গোপন ড্যাশবোর্ড ঠিকানা, যেমন `owner-amit2580`
   - `OWNER_SECRET` = যেকোনো লম্বা এলোমেলো লেখা (৩০+ অক্ষর) – এতে রিস্টার্টের পরও লগইন থাকে
4. **Files** ট্যাব → **Add file → Upload files**
   - zip খুলে `pdfapp` ফোল্ডারের **ভেতরের সব কিছু** (Dockerfile, README.md, app.py, backend, static, fonts…) টেনে ছেড়ে দিন
   - README.md replace করতে বললে হ্যাঁ দিন → **Commit changes to main**
5. **App** ট্যাবে "Building" দেখাবে (১০–২০ মিনিট)। "Running" হলে সাইট চালু।
   - সাইট: `https://USERNAME-eng-pdf.hf.space`
   - ড্যাশবোর্ড: `https://USERNAME-eng-pdf.hf.space/OWNER_PATH`

মনে রাখবেন
- সবসময় সরাসরি `.hf.space` লিংকটা শেয়ার করুন (huggingface.co/spaces/... পেজের ভেতরে কুকি ঠিকমতো কাজ নাও করতে পারে)।
- ৪৮ ঘণ্টা কেউ না এলে Space ঘুমিয়ে যায়; কেউ এলে আবার ১–২ মিনিটে চালু হয়।
- ফ্রি প্ল্যানে রিস্টার্ট/আপডেট হলে ভিজিটর পরিসংখ্যান মুছে যায় (সাইট ও পাসওয়ার্ড ঠিক থাকে)। আগে CSV এক্সপোর্ট করে রাখতে পারেন।
- পরে কোড বদলালে শুধু বদলানো ফাইলটা আবার Upload করলেই Space নিজে থেকে আপডেট হবে।
