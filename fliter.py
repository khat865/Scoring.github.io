import json
import random

def validate_and_filter_data(input_file, output_file):
    """
    验证并筛选数据，确保数据质量
    
    筛选规则：
    1. 不能有 None 值
    2. task3_pairs 必须有2个且不重复
    3. predicted_diagnosis 和 ground_truth_diagnosis 必须不一致
    4. 必须有 image_paths
    """
    
    print(f"读取数据: {input_file}")
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"原始数据量: {len(data)} 个病例")
    
    valid_cases = []
    removed_cases = []
    
    for idx, case in enumerate(data):
        case_id = case.get('pmid', case.get('id', f'case_{idx}'))
        remove_reason = []
        
        # 规则1: 检查是否有 None 值
        if has_none_values(case):
            remove_reason.append("包含None值")
        
        # 规则2: 检查 task3_pairs
        task3_valid, task3_reason = validate_task3_pairs(case.get('task3_pairs', []))
        if not task3_valid:
            remove_reason.append(task3_reason)
        
        # 规则3: 检查诊断是否一致
        pred_diag = case.get('predicted_diagnosis', '')
        truth_diag = case.get('ground_truth_diagnosis', '')
        
        if not pred_diag or not truth_diag:
            remove_reason.append("诊断为空")
        elif diagnoses_are_same(pred_diag, truth_diag):
            remove_reason.append(f"诊断一致: '{pred_diag}' == '{truth_diag}'")
        
        # 规则4: 检查是否有图片路径
        image_paths = case.get('image_paths', [])
        if not image_paths or len(image_paths) == 0:
            remove_reason.append("无图片路径")
        
        # 规则5: 检查必需字段
        required_fields = ['id', 'pmid', 'prompt']
        for field in required_fields:
            if not case.get(field):
                remove_reason.append(f"缺少必需字段: {field}")
        
        # 判断是否保留
        if remove_reason:
            removed_cases.append({
                'case_id': case_id,
                'reasons': remove_reason,
                'predicted_diagnosis': pred_diag,
                'ground_truth_diagnosis': truth_diag
            })
        else:
            valid_cases.append(case)
    
    
    # 随机保留200个有效病例
    total_valid = len(valid_cases)
    if len(valid_cases) > 200:
        random.shuffle(valid_cases)
        valid_cases = valid_cases[:200]
        print(f"\n注意: 有效病例数超过200个({total_valid}个)，随机选择200个保留")
    # 保存有效数据
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(valid_cases, f, ensure_ascii=False, indent=2)
    
    # 输出统计信息
    print("\n" + "="*60)
    print("数据筛选完成")
    print("="*60)
    print(f"原始病例数: {len(data)}")
    print(f"有效病例数: {len(valid_cases)}")
    print(f"移除病例数: {len(removed_cases)}")
    print(f"保留比例: {len(valid_cases)/len(data)*100:.1f}%")
    
    # 输出移除原因统计
    if removed_cases:
        print("\n移除原因统计:")
        reason_counts = {}
        for case in removed_cases:
            for reason in case['reasons']:
                reason_counts[reason] = reason_counts.get(reason, 0) + 1
        
        for reason, count in sorted(reason_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"  • {reason}: {count} 个病例")
        
        # 显示前5个被移除的病例详情
        print("\n前5个被移除的病例详情:")
        for i, case in enumerate(removed_cases[:5], 1):
            print(f"\n{i}. 病例 {case['case_id']}:")
            print(f"   原因: {', '.join(case['reasons'])}")
            if case['predicted_diagnosis'] or case['ground_truth_diagnosis']:
                print(f"   预测诊断: {case['predicted_diagnosis']}")
                print(f"   真实诊断: {case['ground_truth_diagnosis']}")
    
    print(f"\n有效数据已保存到: {output_file}")
    
    return valid_cases, removed_cases


def has_none_values(obj, path=""):
    """
    递归检查对象中是否有 None 值
    """
    if obj is None:
        return True
    
    if isinstance(obj, dict):
        for key, value in obj.items():
            if has_none_values(value, f"{path}.{key}"):
                return True
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            if has_none_values(item, f"{path}[{i}]"):
                return True
    
    return False


def validate_task3_pairs(pairs):
    """
    验证 task3_pairs
    返回: (是否有效, 错误原因)
    """
    if not pairs or len(pairs) < 2:
        return False, f"task3_pairs数量不足2个 (当前: {len(pairs) if pairs else 0})"
    
    if len(pairs) > 2:
        return False, f"task3_pairs数量超过2个 (当前: {len(pairs)})"
    
    # 检查每对的结构
    for i, pair in enumerate(pairs):
        if not isinstance(pair, dict):
            return False, f"task3_pairs[{i}]不是字典"
        
        required_fields = ['pair_id', 'predicted', 'ground_truth', 'similarity']
        for field in required_fields:
            if field not in pair:
                return False, f"task3_pairs[{i}]缺少字段: {field}"
            if pair[field] is None:
                return False, f"task3_pairs[{i}].{field}为None"
    
    # 检查是否重复
    pair_a = pairs[0]
    pair_b = pairs[1]
    
    # 检查 pair_id 是否不同
    if pair_a.get('pair_id') == pair_b.get('pair_id'):
        return False, "两对的pair_id相同"
    
    # 检查诊断内容是否完全相同
    if (pair_a.get('predicted') == pair_b.get('predicted') and 
        pair_a.get('ground_truth') == pair_b.get('ground_truth')):
        return False, f"两对的诊断内容完全相同: ({pair_a.get('predicted')}, {pair_a.get('ground_truth')})"
    
    return True, ""


def diagnoses_are_same(diag1, diag2):
    """
    判断两个诊断是否相同
    考虑到可能的大小写、空格等差异
    """
    if not diag1 or not diag2:
        return False
    
    # 转换为小写并去除首尾空格
    d1 = diag1.lower().strip()
    d2 = diag2.lower().strip()
    
    # 完全相同
    if d1 == d2:
        return True
    
    # 去除标点符号后比较
    import re
    d1_clean = re.sub(r'[^\w\s]', '', d1)
    d2_clean = re.sub(r'[^\w\s]', '', d2)
    
    if d1_clean == d2_clean:
        return True
    
    # 检查是否一个包含另一个（且长度相近）
    if d1 in d2 or d2 in d1:
        len_ratio = min(len(d1), len(d2)) / max(len(d1), len(d2))
        if len_ratio > 0.8:  # 长度相差不超过20%
            return True
    
    return False


def generate_filter_report(input_file, output_file, report_file):
    """
    生成详细的筛选报告
    """
    valid_cases, removed_cases = validate_and_filter_data(input_file, output_file)
    
    # 生成详细报告
    report = []
    report.append("# 数据筛选报告\n")
    report.append(f"输入文件: {input_file}\n")
    report.append(f"输出文件: {output_file}\n")
    report.append(f"生成时间: {import_datetime()}\n\n")
    
    report.append("## 统计摘要\n\n")
    report.append(f"- 原始病例数: {len(valid_cases) + len(removed_cases)}\n")
    report.append(f"- 有效病例数: {len(valid_cases)}\n")
    report.append(f"- 移除病例数: {len(removed_cases)}\n")
    report.append(f"- 保留比例: {len(valid_cases)/(len(valid_cases)+len(removed_cases))*100:.1f}%\n\n")
    
    if removed_cases:
        report.append("## 移除的病例列表\n\n")
        for i, case in enumerate(removed_cases, 1):
            report.append(f"### {i}. 病例 {case['case_id']}\n\n")
            report.append(f"**移除原因**: {', '.join(case['reasons'])}\n\n")
            if case['predicted_diagnosis']:
                report.append(f"**预测诊断**: {case['predicted_diagnosis']}\n\n")
            if case['ground_truth_diagnosis']:
                report.append(f"**真实诊断**: {case['ground_truth_diagnosis']}\n\n")
            report.append("---\n\n")
    
    # 保存报告
    with open(report_file, 'w', encoding='utf-8') as f:
        f.writelines(report)
    
    print(f"\n详细报告已保存到: {report_file}")


def import_datetime():
    """获取当前时间"""
    from datetime import datetime
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# 使用示例
if __name__ == "__main__":
    input_file = "data.json"          # 输入文件
    output_file = "data_filtered.json"  # 输出的筛选后文件
    report_file = "filter_report.md"    # 筛选报告
    
    print("="*60)
    print("数据筛选脚本")
    print("="*60)
    print("\n筛选规则:")
    print("  1. 移除包含 None 值的病例")
    print("  2. task3_pairs 必须恰好有2对且不重复")
    print("  3. predicted_diagnosis 和 ground_truth_diagnosis 必须不一致")
    print("  4. 必须有 image_paths")
    print("  5. 必须有必需字段 (id, pmid, prompt)")
    print("\n开始处理...\n")
    
    # 方式1: 只筛选数据
    valid_cases, removed_cases = validate_and_filter_data(input_file, output_file)
    
    # 方式2: 生成详细报告（可选）
    # generate_filter_report(input_file, output_file, report_file)
    
    # 显示第一个有效病例
    if valid_cases:
        print("\n第一个有效病例示例:")
        print(json.dumps(valid_cases[0], ensure_ascii=False, indent=2)[:500] + "...")