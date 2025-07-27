import os
import shutil
import subprocess

# اسم المجلد الجديد
CLEAN_REPO = "cleaned_backend_repo"
TARGET_FILE = "dataset/customer_history_data_ar_with_vectors.csv"

# 1. نسخ مجلد المشروع لمجلد جديد
if os.path.exists(CLEAN_REPO):
    shutil.rmtree(CLEAN_REPO)
shutil.copytree(".", CLEAN_REPO, ignore=shutil.ignore_patterns(".git"))

# 2. إنشاء git جديد داخل النسخة
os.chdir(CLEAN_REPO)
subprocess.run(["git", "init"])
subprocess.run(["git", "add", "."])

# 3. حذف الملف الكبير من التتبع (لو كان موجود)
if os.path.exists(TARGET_FILE):
    subprocess.run(["git", "rm", "--cached", TARGET_FILE])
    with open(".gitignore", "a") as f:
        f.write(f"\n{TARGET_FILE}\n")
    subprocess.run(["git", "add", ".gitignore"])

# 4. Commit
subprocess.run(["git", "commit", "-m", "Clean version without large file"])

print(f"\n✅ Ready! Your cleaned repo is in: {os.path.abspath(CLEAN_REPO)}")
