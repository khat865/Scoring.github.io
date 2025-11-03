import json

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for case in data:
    new_image_paths = []
    for path in case['image_paths']:
        new_path = path.replace('/gpfs/radev/pi/q_chen/zq65/Research/Data/DermDPO/datasets/eval/SCIN/images/', 'images/SCIN/images/')
        new_image_paths.append(new_path)
    case['image_paths'] = new_image_paths


with open('data_modified.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("路径修改完成！已保存到 data.json")