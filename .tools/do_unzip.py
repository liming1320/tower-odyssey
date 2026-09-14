import zipfile, os
src = r'E:/WorkSpace/tower-odyssey/.tools/pe-tools.zip'
dst = r'E:/WorkSpace/tower-odyssey/.tools/pe-tools'
os.makedirs(dst, exist_ok=True)
z = zipfile.ZipFile(src)
z.extractall(dst)
print(len(z.namelist()), 'entries')
