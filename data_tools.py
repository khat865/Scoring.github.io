import json
import random
from pathlib import Path

def add_case_ids(input_file, output_file):
    """给输入文件添加case_id"""
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for idx, item in enumerate(data):
        item['case_id'] = f"case_{idx}"
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    return data

def load_evaluation_data(eval_file):
    """加载评估数据文件"""
    with open(eval_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data

def load_template_data(template_file):
    """加载模板数据文件"""
    with open(template_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data

def merge_and_filter(cases_with_ids, eval_data, template_data, n_samples=50, output_file='output_filtered.json'):
    """
    从模板中随机选择n个样本，仅替换指定字段
    
    Args:
        cases_with_ids: 带有case_id的案例数据
        eval_data: 评估数据
        template_data: 模板数据（保留task3_pairs及之后的所有内容）
        n_samples: 要选择的样本数量
        output_file: 输出文件路径
    """
    # 创建案例数据字典，方便查找
    cases_dict = {case['case_id']: case for case in cases_with_ids}
    
    # 创建评估数据的字典，方便查找
    eval_dict = {}
    if 'per_sample_results' in eval_data:
        for item in eval_data['per_sample_results']:
            eval_dict[item['case_id']] = item
    
    # 随机选择n个模板案例
    if len(template_data) < n_samples:
        print(f"警告: 模板案例数({len(template_data)})少于请求数({n_samples})")
        selected_templates = template_data
    else:
        selected_templates = random.sample(template_data, n_samples)
    
    # 构建输出数据
    output_data = []
    
    for template_item in selected_templates:
        template_case_id = template_item['id']
        
        # 查找对应的案例数据
        case_data = cases_dict.get(template_case_id, {})
        
        # 查找对应的评估数据
        eval_item = eval_dict.get(template_case_id, {})
        
        # 创建新条目，从模板复制所有内容
        new_item = template_item.copy()
        
        # 仅替换指定的字段
        if case_data:
            new_item['image_paths'] = case_data.get('image_paths', template_item.get('image_paths', []))
            new_item['prompt'] = case_data.get('prompt', template_item.get('prompt', ''))
        
        if eval_item:
            new_item['predicted_diagnosis'] = eval_item.get('predicted_diagnosis', template_item.get('predicted_diagnosis', ''))
            new_item['ground_truth_diagnosis'] = eval_item.get('ground_truth_diagnosis', template_item.get('ground_truth_diagnosis', ''))
        elif case_data and 'GT' in case_data:
            # 如果评估数据中没有，尝试从案例数据的GT字段获取
            new_item['ground_truth_diagnosis'] = case_data['GT'].get('label_1', template_item.get('ground_truth_diagnosis', ''))
        
        # id和pmid保持不变（使用模板中的值）
        # task3_pairs及之后的所有内容自动保留（因为使用了copy()）
        
        output_data.append(new_item)
    
    # 保存输出文件
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
    
    print(f"成功生成 {len(output_data)} 个案例到 {output_file}")
    print(f"选中的案例ID: {[item['id'] for item in output_data[:10]]}...")
    return output_data

# 主执行流程
if __name__ == "__main__":
    # 设置随机种子以便结果可复现（可选）
    random.seed(42)
    
    # 文件路径
    INPUT_CASES_FILE = "SCIN_no_DD_input.json"  # 需要添加case_id的原始文件
    CASES_WITH_IDS_FILE = "cases_with_ids.json"  # 添加case_id后的临时文件
    EVAL_DATA_FILE = "scin_final_diagnosis_evaluation.json"  # 第一个文档的内容
    TEMPLATE_FILE = "data_filtered.json"  # 第二个文档的内容（模板）
    OUTPUT_FILE = "output_filtered.json"  # 最终输出文件
    
    try:
        # 步骤1: 给原始案例添加case_id
        print("步骤1: 添加case_id...")
        cases_with_ids = add_case_ids(INPUT_CASES_FILE, CASES_WITH_IDS_FILE)
        print(f"已添加case_id，共 {len(cases_with_ids)} 个案例")
        
        # 步骤2: 加载评估数据
        print("\n步骤2: 加载评估数据...")
        eval_data = load_evaluation_data(EVAL_DATA_FILE)
        print("评估数据加载完成")
        
        # 步骤3: 加载模板数据
        print("\n步骤3: 加载模板数据...")
        template_data = load_template_data(TEMPLATE_FILE)
        print(f"模板数据加载完成，共 {len(template_data)} 个模板")
        
        # 步骤4: 从模板中随机选择50个案例，仅替换指定字段
        print("\n步骤4: 随机选择50个模板案例并替换指定字段...")
        output_data = merge_and_filter(
            cases_with_ids, 
            eval_data, 
            template_data, 
            n_samples=50, 
            output_file=OUTPUT_FILE
        )
        
        print(f"\n完成! 输出文件: {OUTPUT_FILE}")
        print("\n注意: 仅替换了以下字段:")
        print("  - image_paths")
        print("  - prompt")
        print("  - predicted_diagnosis")
        print("  - ground_truth_diagnosis")
        print("\n保留了模板中的所有其他字段，包括:")
        print("  - id, pmid")
        print("  - task3_pairs")
        print("  - predicted_differential_diagnosis_full")
        print("  - ground_truth_differential_diagnosis_full")
        print("  - similarity_variance")
        print("  - similarity_range")
        
    except FileNotFoundError as e:
        print(f"错误: 找不到文件 - {e}")
        print("\n请确保以下文件存在:")
        print(f"  - {INPUT_CASES_FILE}")
        print(f"  - {EVAL_DATA_FILE}")
        print(f"  - {TEMPLATE_FILE}")
    except Exception as e:
        print(f"发生错误: {e}")
        import traceback
        traceback.print_exc()