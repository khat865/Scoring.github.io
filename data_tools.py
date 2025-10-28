#!/usr/bin/env python3
"""
医学数据处理工具 - 改进版
支持添加PMID或唯一ID避免文件名冲突
"""

import json
import os
import shutil
from pathlib import Path
import hashlib

def extract_pmid_from_path(path):
    """
    从路径中提取PMID
    例如: E:/medical/.../38865572/images/figure.jpg -> 38865572
    """
    parts = Path(path).parts
    for part in parts:
        # 查找像PMID的数字（通常是8位数字）
        if part.isdigit() and len(part) >= 6:
            return part
    return None


def process_medical_data(input_file='your_data.json', output_file='medical_data.json', 
                         copy_images=True, add_prefix=True):
    """
    处理医学数据并复制图片到项目目录
    
    参数:
        input_file: 输入的原始数据文件
        output_file: 输出的处理后数据文件
        copy_images: 是否复制图片到项目images目录
        add_prefix: 是否添加前缀避免重名（PMID或索引）
    """
    print("=" * 60)
    print("医学数据处理工具 - 改进版")
    print("=" * 60)
    
    # 读取原始数据
    print(f"\n📖 正在读取数据文件: {input_file}")
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"❌ 错误: 找不到文件 {input_file}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ 错误: JSON 格式错误 - {e}")
        return False
    
    print(f"✓ 成功加载 {len(data)} 个病例")
    
    # 创建images目录
    images_dir = Path('images')
    if copy_images:
        images_dir.mkdir(exist_ok=True)
        print(f"\n📁 图片目录: {images_dir.absolute()}")
    
    # 处理数据
    processed_data = []
    total_images = 0
    copied_images = 0
    missing_images = []
    renamed_map = {}  # 记录重命名映射
    
    print(f"\n🔄 开始处理数据...")
    if add_prefix:
        print("✓ 启用前缀模式，避免文件名冲突")
    
    for idx, item in enumerate(data, 1):
        if 'image_paths' not in item or 'prompt' not in item:
            print(f"⚠️  病例 {idx}: 缺少必需字段，跳过")
            continue
        
        new_image_paths = []
        
        # 尝试从第一个图片路径提取PMID
        pmid = None
        if item['image_paths'] and add_prefix:
            pmid = extract_pmid_from_path(item['image_paths'][0])
        
        # 如果没有找到PMID，使用索引
        if not pmid and add_prefix:
            pmid = f"case{idx:04d}"
        
        for img_path in item['image_paths']:
            total_images += 1
            
            if copy_images:
                src_path = Path(img_path)
                
                if not src_path.exists():
                    print(f"⚠️  图片不存在: {img_path}")
                    missing_images.append(img_path)
                    # 仍然生成目标路径
                    if add_prefix:
                        new_filename = f"{pmid}_{src_path.name}"
                    else:
                        new_filename = src_path.name
                    new_image_paths.append(f"images/{new_filename}")
                    continue
                
                # 生成新的文件名
                if add_prefix:
                    new_filename = f"{pmid}_{src_path.name}"
                else:
                    new_filename = src_path.name
                
                dst_path = images_dir / new_filename
                
                # 记录重命名
                if src_path.name != new_filename:
                    renamed_map[str(src_path)] = new_filename
                
                try:
                    shutil.copy2(src_path, dst_path)
                    copied_images += 1
                    new_image_paths.append(f"images/{new_filename}")
                except Exception as e:
                    print(f"❌ 复制失败 {src_path.name}: {e}")
                    new_image_paths.append(img_path)
            else:
                # 不复制图片，只转换路径格式
                filename = Path(img_path).name
                if add_prefix:
                    new_filename = f"{pmid}_{filename}"
                else:
                    new_filename = filename
                new_image_paths.append(f"images/{new_filename}")
        
        processed_item = {
            'image_paths': new_image_paths,
            'prompt': item['prompt']
        }
        
        # 保留PMID信息（可选）
        if pmid and pmid.startswith('case'):
            processed_item['case_id'] = pmid
        elif pmid:
            processed_item['pmid'] = pmid
        
        processed_data.append(processed_item)
        
        if idx % 10 == 0:
            print(f"  处理进度: {idx}/{len(data)}")
    
    # 保存处理后的数据
    print(f"\n💾 保存处理后的数据到: {output_file}")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(processed_data, f, ensure_ascii=False, indent=2)
    
    # 输出统计信息
    print("\n" + "=" * 60)
    print("📊 处理完成！统计信息:")
    print("=" * 60)
    print(f"✓ 处理病例数: {len(processed_data)}")
    print(f"✓ 总图片数: {total_images}")
    
    if copy_images:
        print(f"✓ 成功复制图片: {copied_images}")
        if add_prefix:
            print(f"✓ 添加前缀避免重名: {len(renamed_map)} 个文件")
        if missing_images:
            print(f"⚠️  缺失图片: {len(missing_images)}")
            print(f"\n缺失图片列表保存到: missing_images.txt")
            with open('missing_images.txt', 'w', encoding='utf-8') as f:
                for img in missing_images:
                    f.write(f"{img}\n")
    
    if renamed_map and copy_images:
        print(f"\n✓ 重命名映射保存到: renamed_files.txt")
        with open('renamed_files.txt', 'w', encoding='utf-8') as f:
            f.write("原始路径 -> 新文件名\n")
            f.write("=" * 80 + "\n")
            for orig, new in renamed_map.items():
                f.write(f"{orig}\n  -> {new}\n\n")
    
    print(f"\n✓ 输出文件: {output_file}")
    print("=" * 60)
    
    return True


def check_duplicates(input_file='your_data.json'):
    """检查数据中是否有重复的图片文件名"""
    print("\n" + "=" * 60)
    print("检查重复文件名")
    print("=" * 60)
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ 读取文件失败: {e}")
        return
    
    all_filenames = []
    for item in data:
        if 'image_paths' in item:
            for path in item['image_paths']:
                filename = Path(path).name
                all_filenames.append(filename)
    
    # 统计重复
    from collections import Counter
    filename_counts = Counter(all_filenames)
    duplicates = {name: count for name, count in filename_counts.items() if count > 1}
    
    print(f"\n总文件数: {len(all_filenames)}")
    print(f"唯一文件名: {len(filename_counts)}")
    print(f"重复文件名: {len(duplicates)}")
    
    if duplicates:
        print(f"\n⚠️  发现 {len(duplicates)} 个重复的文件名:")
        print("-" * 60)
        for name, count in sorted(duplicates.items(), key=lambda x: x[1], reverse=True)[:20]:
            print(f"  {name}: 出现 {count} 次")
        if len(duplicates) > 20:
            print(f"  ... 还有 {len(duplicates)-20} 个重复文件名")
        
        print(f"\n💡 建议: 使用 'process' 命令并启用前缀模式")
        print("   python medical_data_tools.py process your_data.json")
    else:
        print("\n✓ 没有发现重复的文件名")
    
    print("=" * 60)


def validate_medical_data(data_file='medical_data.json'):
    """验证医学数据格式"""
    print("\n" + "=" * 60)
    print("验证医学数据格式")
    print("=" * 60)
    
    try:
        with open(data_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"❌ 错误: 找不到文件 {data_file}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ 错误: JSON 格式错误 - {e}")
        return False
    
    errors = []
    warnings = []
    
    print(f"\n📊 数据统计:")
    print(f"  总病例数: {len(data)}")
    
    total_images = 0
    for idx, item in enumerate(data, 1):
        if 'image_paths' not in item:
            errors.append(f"病例 {idx}: 缺少 'image_paths' 字段")
        elif not isinstance(item['image_paths'], list):
            errors.append(f"病例 {idx}: 'image_paths' 应该是数组")
        else:
            total_images += len(item['image_paths'])
            if len(item['image_paths']) == 0:
                warnings.append(f"病例 {idx}: 没有图片")
        
        if 'prompt' not in item:
            errors.append(f"病例 {idx}: 缺少 'prompt' 字段")
        elif not isinstance(item['prompt'], str):
            errors.append(f"病例 {idx}: 'prompt' 应该是字符串")
    
    print(f"  总图片数: {total_images}")
    if len(data) > 0:
        print(f"  平均每病例图片数: {total_images/len(data):.1f}")
    
    if errors:
        print(f"\n❌ 发现 {len(errors)} 个错误:")
        for error in errors[:10]:
            print(f"  {error}")
        if len(errors) > 10:
            print(f"  ... 还有 {len(errors)-10} 个错误")
        return False
    
    if warnings:
        print(f"\n⚠️  发现 {len(warnings)} 个警告:")
        for warning in warnings[:10]:
            print(f"  {warning}")
    
    print("\n✓ 数据格式验证通过")
    print("=" * 60)
    return True


def create_sample_medical_data(num_cases=5, output_file='medical_data.json'):
    """创建示例医学数据"""
    print(f"创建 {num_cases} 个示例病例...")
    
    sample_prompts = [
        "A 45-year-old patient presents with skin lesions. Please evaluate the clinical presentation.",
        "Dermatological findings in a 32-year-old female with autoimmune condition.",
        "Chronic skin manifestation in immunocompromised patient. Diagnostic approach needed.",
        "Pediatric case: 8-year-old with progressive rash. Please provide differential diagnosis.",
        "Elderly patient with atypical dermatitis. Consider systemic factors."
    ]
    
    data = []
    for i in range(num_cases):
        # 使用PMID风格的ID
        pmid = f"{30000000 + i}"
        item = {
            "image_paths": [
                f"images/{pmid}_figure_01.jpg",
                f"images/{pmid}_figure_02.jpg",
                f"images/{pmid}_figure_03.jpg"
            ],
            "prompt": sample_prompts[i % len(sample_prompts)],
            "pmid": pmid
        }
        data.append(item)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"✓ 示例数据已创建: {output_file}")
    print(f"✓ 包含 {num_cases} 个病例，每个病例 3 张图片")
    print(f"✓ 图片文件名已添加PMID前缀避免冲突")


def main():
    import sys
    
    if len(sys.argv) < 2:
        print("=" * 60)
        print("医学数据处理工具 - 改进版")
        print("=" * 60)
        print("\n使用方法:")
        print("  python medical_data_tools.py process <输入文件> [输出文件]")
        print("    - 处理数据并复制图片，自动添加PMID前缀避免重名")
        print("\n  python medical_data_tools.py check <输入文件>")
        print("    - 检查是否有重复的文件名")
        print("\n  python medical_data_tools.py validate [数据文件]")
        print("    - 验证数据格式")
        print("\n  python medical_data_tools.py sample [数量]")
        print("    - 创建示例数据")
        print("\n示例:")
        print("  python medical_data_tools.py check your_data.json")
        print("  python medical_data_tools.py process your_data.json")
        print("  python medical_data_tools.py validate medical_data.json")
        print("=" * 60)
        return
    
    command = sys.argv[1]
    
    if command == 'process':
        input_file = sys.argv[2] if len(sys.argv) > 2 else 'your_data.json'
        output_file = sys.argv[3] if len(sys.argv) > 3 else 'medical_data.json'
        process_medical_data(input_file, output_file, copy_images=True, add_prefix=True)
    
    elif command == 'check':
        input_file = sys.argv[2] if len(sys.argv) > 2 else 'your_data.json'
        check_duplicates(input_file)
    
    elif command == 'validate':
        data_file = sys.argv[2] if len(sys.argv) > 2 else 'medical_data.json'
        validate_medical_data(data_file)
    
    elif command == 'sample':
        num_cases = int(sys.argv[2]) if len(sys.argv) > 2 else 5
        create_sample_medical_data(num_cases)
    
    else:
        print(f"❌ 未知命令: {command}")
        print("运行 'python medical_data_tools.py' 查看帮助")


if __name__ == '__main__':
    main()