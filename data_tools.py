#!/usr/bin/env python3
"""
医学数据处理工具
处理包含多张图片的医学评分数据
"""

import json
import os
import shutil
from pathlib import Path

def process_medical_data(input_file='your_data.json', output_file='medical_data.json', copy_images=True):
    """
    处理医学数据并复制图片到项目目录
    
    参数:
        input_file: 输入的原始数据文件
        output_file: 输出的处理后数据文件
        copy_images: 是否复制图片到项目images目录
    """
    print("=" * 60)
    print("医学数据处理工具")
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
    
    print(f"\n🔄 开始处理数据...")
    
    for idx, item in enumerate(data, 1):
        if 'image_paths' not in item or 'prompt' not in item:
            print(f"⚠️  病例 {idx}: 缺少必需字段，跳过")
            continue
        
        new_image_paths = []
        
        for img_path in item['image_paths']:
            total_images += 1
            
            if copy_images:
                # 提取文件名
                src_path = Path(img_path)
                
                if not src_path.exists():
                    print(f"⚠️  图片不存在: {img_path}")
                    missing_images.append(img_path)
                    # 仍然保留原路径，让用户知道
                    new_image_paths.append(f"images/{src_path.name}")
                    continue
                
                # 复制到images目录
                dst_path = images_dir / src_path.name
                
                try:
                    shutil.copy2(src_path, dst_path)
                    copied_images += 1
                    new_image_paths.append(f"images/{src_path.name}")
                except Exception as e:
                    print(f"❌ 复制失败 {src_path.name}: {e}")
                    new_image_paths.append(img_path)
            else:
                # 不复制图片，转换路径格式
                filename = Path(img_path).name
                new_image_paths.append(f"images/{filename}")
        
        processed_item = {
            'image_paths': new_image_paths,
            'prompt': item['prompt']
        }
        
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
        if missing_images:
            print(f"⚠️  缺失图片: {len(missing_images)}")
            print(f"\n缺失图片列表保存到: missing_images.txt")
            with open('missing_images.txt', 'w', encoding='utf-8') as f:
                for img in missing_images:
                    f.write(f"{img}\n")
    
    print(f"\n✓ 输出文件: {output_file}")
    print("=" * 60)
    
    return True


def create_web_friendly_paths(input_file='your_data.json', output_file='medical_data.json'):
    """
    只转换路径，不复制图片
    适用于图片已经在正确位置的情况
    """
    print("转换路径格式（不复制图片）...")
    return process_medical_data(input_file, output_file, copy_images=False)


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
        # 检查必需字段
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
        item = {
            "image_paths": [
                f"images/case_{i+1:03d}_img1.jpg",
                f"images/case_{i+1:03d}_img2.jpg",
                f"images/case_{i+1:03d}_img3.jpg"
            ],
            "prompt": sample_prompts[i % len(sample_prompts)]
        }
        data.append(item)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"✓ 示例数据已创建: {output_file}")
    print(f"✓ 包含 {num_cases} 个病例，每个病例 3 张图片")


def extract_unique_images(input_file='your_data.json'):
    """提取所有唯一的图片路径"""
    print("\n提取所有图片路径...")
    
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    all_images = set()
    for item in data:
        if 'image_paths' in item:
            for img in item['image_paths']:
                all_images.add(img)
    
    output_file = 'all_image_paths.txt'
    with open(output_file, 'w', encoding='utf-8') as f:
        for img in sorted(all_images):
            f.write(f"{img}\n")
    
    print(f"✓ 提取完成")
    print(f"✓ 总图片数: {len(all_images)}")
    print(f"✓ 路径列表保存到: {output_file}")


def main():
    import sys
    
    if len(sys.argv) < 2:
        print("=" * 60)
        print("医学数据处理工具")
        print("=" * 60)
        print("\n使用方法:")
        print("  python medical_data_tools.py process <输入文件> [输出文件]")
        print("    - 处理数据并复制图片到images目录")
        print("\n  python medical_data_tools.py convert <输入文件> [输出文件]")
        print("    - 只转换路径格式，不复制图片")
        print("\n  python medical_data_tools.py validate [数据文件]")
        print("    - 验证数据格式")
        print("\n  python medical_data_tools.py sample [数量]")
        print("    - 创建示例数据")
        print("\n  python medical_data_tools.py extract <输入文件>")
        print("    - 提取所有图片路径到文本文件")
        print("\n示例:")
        print("  python medical_data_tools.py process your_data.json")
        print("  python medical_data_tools.py validate medical_data.json")
        print("  python medical_data_tools.py sample 10")
        print("=" * 60)
        return
    
    command = sys.argv[1]
    
    if command == 'process':
        input_file = sys.argv[2] if len(sys.argv) > 2 else 'your_data.json'
        output_file = sys.argv[3] if len(sys.argv) > 3 else 'medical_data.json'
        process_medical_data(input_file, output_file, copy_images=True)
    
    elif command == 'convert':
        input_file = sys.argv[2] if len(sys.argv) > 2 else 'your_data.json'
        output_file = sys.argv[3] if len(sys.argv) > 3 else 'medical_data.json'
        create_web_friendly_paths(input_file, output_file)
    
    elif command == 'validate':
        data_file = sys.argv[2] if len(sys.argv) > 2 else 'medical_data.json'
        validate_medical_data(data_file)
    
    elif command == 'sample':
        num_cases = int(sys.argv[2]) if len(sys.argv) > 2 else 5
        create_sample_medical_data(num_cases)
    
    elif command == 'extract':
        input_file = sys.argv[2] if len(sys.argv) > 2 else 'your_data.json'
        extract_unique_images(input_file)
    
    else:
        print(f"❌ 未知命令: {command}")


if __name__ == '__main__':
    main()