import json
import os
import shutil
from pathlib import Path

def move_images_from_json(json_file_path, source_dir, target_dir):
    """
    根据JSON文件中的图片路径，将图片从源目录复制到目标目录
    
    参数:
        json_file_path: JSON文件路径
        source_dir: 源图片目录 (E:\medical\scin\images)
        target_dir: 目标目录
    """
    
    # 读取JSON文件
    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"成功读取JSON文件: {json_file_path}")
    except Exception as e:
        print(f"读取JSON文件失败: {e}")
        return
    
    # 创建目标目录
    Path(target_dir).mkdir(parents=True, exist_ok=True)
    print(f"目标目录: {target_dir}")
    
    # 统计信息
    total_images = 0
    copied_images = 0
    missing_images = []
    
    # 遍历JSON数据
    for case in data:
        case_id = case.get('id', 'unknown')
        image_paths = case.get('image_paths', [])
        
        for img_path in image_paths:
            total_images += 1
            
            # 提取图片文件名
            # 例如: "images/SCIN/images/-217828380359571871.png" -> "-217828380359571871.png"
            img_filename = os.path.basename(img_path)
            
            # 构建源文件完整路径
            source_file = os.path.join(source_dir, img_filename)
            
            # 构建目标文件完整路径
            target_file = os.path.join(target_dir, img_filename)
            
            # 检查源文件是否存在
            if os.path.exists(source_file):
                try:
                    # 复制文件到目标目录
                    shutil.copy2(source_file, target_file)
                    copied_images += 1
                    print(f"✓ 已复制: {img_filename} (案例: {case_id})")
                except Exception as e:
                    print(f"✗ 复制失败 {img_filename}: {e}")
            else:
                missing_images.append(img_filename)
                print(f"✗ 文件不存在: {img_filename} (案例: {case_id})")
    
    # 打印统计信息
    print("\n" + "="*50)
    print("处理完成!")
    print(f"总图片数: {total_images}")
    print(f"成功复制: {copied_images}")
    print(f"缺失文件: {len(missing_images)}")
    
    if missing_images:
        print("\n缺失的文件列表:")
        for img in missing_images:
            print(f"  - {img}")


if __name__ == "__main__":
    # 配置路径
    JSON_FILE = "data.json"  # JSON文件路径
    SOURCE_DIR = r"E:\medical\scin\images"  # 源图片目录
    TARGET_DIR = "images/SCIN/images"  # 目标目录，请修改为你想要的路径

    print("图片文件移动脚本")
    print("="*50)
    print(f"JSON文件: {JSON_FILE}")
    print(f"源目录: {SOURCE_DIR}")
    print(f"目标目录: {TARGET_DIR}")
    print("="*50 + "\n")
    
    # 确认是否继续
    confirm = input("确认开始处理? (y/n): ")
    if confirm.lower() == 'y':
        move_images_from_json(JSON_FILE, SOURCE_DIR, TARGET_DIR)
    else:
        print("操作已取消")