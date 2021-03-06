//------------------------------------------------------------------
//title: 节点基类
//author: zc
//date:
//desc:z-index 0-1000 line  1000-4000 node 4000-5000 control
//------------------------------------------------------------------
import DrawBase from "./DrawBase" ;
import DrawNode from "./DrawNode";
import NodeControl from "./NodeControl" ;
import DrawLine from "./DrawLine";
import SvgDom from "@/common/utils/SvgDom" ;
import TaskVO from "../data-vo/TaskVO";

export default class DrawContainer extends DrawBase {

  constructor(viewId = "", root = null) {
    super(root);
    this.viewId = viewId;
    this.nodeMap = new Map();
    this.lineMap = new Map();

    //当前选中节点
    this.selectedNode = null;
    this.lineCanvas = null;//没有全用SVG 临时加个层

    this.isDrawing = false;
    this.isDragging = false;

    //节点控制
    this.nodeControl = null ;
  }

  /**
   * 初始化画布
   * @param data TaskVO
   */
  initView(data) {
    this.view = $("#" + this.viewId);

    //清空视图
    this.reset() ;

    //解析数据
    if (!data)
      data = new TaskVO();
    data.init(data);
    this.data = data;

    //初始化视图
    this.initStepView();

    //初始化画板
    this.initCanvas();

    //添加公用控制菜单
    this.createControlView();

    //刷新视图
    this.refreshView();

    //事件监听
    this.initListener() ;
  }

  /**
   * 添加事件监听
   */
  initListener(){
  }

  /**
   * 刷新视图
   */
  refreshView() {
    //创建节点
    let nodeMap = {};
    if (this.data.nodes) {
      for (let node of this.data.nodes) {
         this.addNodeView(node,node.type,false);
      }
    }
    //创建线 {from to }
    if (this.data.lines) {
      for (let line of this.data.lines) {
        let fNode = this.getNodeById(line.from) ;
        let tNode = this.getNodeById(line.to) ;
        if (fNode && tNode)
          this.addLine(fNode, tNode);
      }
    }
  }

  /**
   * 创建控制菜单
   */
  createControlView() {

    //只创建一次
    if(this.nodeControl){
      this.nodeControl.hide();
      return ;
    }

    this.nodeControl = new NodeControl(this);
    this.nodeControl.hide();
    this.nodeControl.view.bind("mouseleave", (ev) => {
      if (!this.nodeControl.node)
        return;
      if (!NormalUtils.hitTestGlobal(ev.pageX, ev.pageY, this.nodeControl.node.view))
        this.hideNodeControl(this.nodeControl.node);
    });
    this.view.append(this.nodeControl.view);
  }

  /**
   * 外部拖入节点添加
   * @param px
   * @param py
   * @param data
   * @param type
   */
  dropNodeIn(px, py, data) {

    //判断是否在当前范围内
    if (!NormalUtils.hitTestGlobal(px, py, this.view, true))
      return;

    //如果已经有输入了 限制添加
    if(data.type === this.TYPE_INPUT){
      if(this.hasTypeNode(this.TYPE_INPUT)){
        this.popMessage("一个模型只能添加一个输入！") ;
        return ;
      }
    }
    else if(data.type === this.TYPE_OUTPUT){
      if(this.hasTypeNode(this.TYPE_OUTPUT)){
        this.popMessage("一个模型只能添加一个输出！") ;
        return ;
      }
    }
    else if(data.type=== this.TYPE_OPERATOR){

      //一个模型只能有一个 机器学习算子
      if(data.pGroup === this.JQ_GROUP){
        if(this.hasJqxxNode()){
          this.popMessage("一个模型只能添加一个机器学习算子！") ;
          return ;
        }
      }
      else if(this.hasIdNode(data.id)){
        this.popMessage("相同算子只能添加一次！") ;
        return ;
      }
    }
    let _pos = NormalUtils.globalToLocal(px, py, this.view);
    data.refreshPosition(_pos.x, _pos.y);
    this.addNodeView(data,data.type);
  }

  /**
   * 添加节点视图
   * @param nodeData
   */
  addNodeView(nodeData, type,validname=true) {
    nodeData.setOptionItem("name",this.setNodeLabel(nodeData.name)) ;//保障 name 唯一
    let _node = new DrawNode(this, nodeData, type, true);
    this.addNode(_node);
    return _node;
  }

  /**
   * 验证名称
   * @param label
   * @returns {*}
   */
  setNodeLabel( label ){
    let nodes = Array.from(this.nodeMap.values()) ;
    let len = nodes.length ;
    let index = 1 ;
    let _lb = label ;
    for(let i=0;i<nodes.length;i++){
      if (nodes[i].name === _lb) {
        _lb = label+"-"+ index ;
        index += 1 ;
        i = 0 ;
      }
    }
    return _lb ;
  }

  /**
   * 添加节点到视图
   * @param node
   */
  addNode(node) {
    this.view.append(node.view);
    node.refresh();
    node.view.bind("click", () => {
      if (this.selectedNode)
        this.selectedNode.selected = false;
      node.selected = true;
      this.selectedNode = node;
    });
    node.view.bind("mouseover", () => {
      this.showNodeControl(node);
    });
    node.view.bind("mouseout", (ev) => {
      if (this.nodeControl.view && NormalUtils.hitTestGlobal(ev.pageX, ev.pageY + 1, this.nodeControl.view))
        return;
      this.hideNodeControl(node);
    });
    this.nodeMap.set(node.id, node);
    this.refreshStepImg();
    return node;
  }

  /**
   * 通过名称获得node
   * @param name
   */
  getNodeById( id ){
    if(this.nodeMap.has(id))
      return this.nodeMap.get(id) ;
    return null ;
  }

  /**
   * 通过名称获得node
   * @param name
   */
  getNodeByName( name ){
    let nodes =  this.nodeMap.values();
    for(let item of nodes){
      if(item.name === name){
        return item ;
        break;
      }
    }
    return null ;
  }

  /**
   * 当前是否有数据
   * @returns {boolean}
   */
  hasData(){
    if(this.nodeMap.size!==0 && !this.data.id)
      return true ;
    return false ;
  }

  /**
   * 显示控制菜单
   * @param node
   */
  showNodeControl(node) {
    if (this.isDragging || this.isDrawing)
      return;
    this.nodeControl.show(node);
  }

  /**
   * 隐藏控制菜单
   * @param node
   */
  hideNodeControl(node) {
    if (this.nodeControl.isDraging)
      return;
    this.nodeControl.hide();
  }

  /**
   * 添加节点到视图
   * @param node
   */
  removeNode(node, destroy = false) {
    if (!this.nodeMap.has(node.id))
      return;
    this.nodeMap.delete(node.id);
    if (node.links)
      this.removeLines(node.getLineArr(), false);
    node.clear();
    node.view.unbind("click");
    node.view.unbind("mouseover");
    node.view.unbind("mouseout");
    if (destroy)
      node.destroy();
    this.refreshStepImg();
    return node;
  }

  /**
   * 初始化画布
   */
  initCanvas() {

    //只创建一次
    if(this.lineCanvas)
      return ;

    this.lineCanvas = SvgDom.createSvg("svg")
      .attr("width", 5000)       //设定宽度
      .attr("height", 5000);    //设定高度

    //箭头库
    $("#" + this.viewId).append(this.lineCanvas);
    var defs = SvgDom.createSvg("defs");
    defs.html('<marker id="arrow" markerWidth="12"' +
      ' markerHeight="12" refx="6" refy="6" ' +
      ' orient="auto" markerUnits="strokeWidth"' +
      ' viewBox="0 0 12 12">' +
      ' <path d="M2,2 L10,6 L2,10 L6,6 L2,2 z" fill="#3d6380" />' +
      '</marker>');
    this.lineCanvas.append(defs);

    //鼠标点击
    this.lineCanvas.on("mousedown", (e) => {
      if (this.selectedNode)
        this.selectedNode.selected = false;
    });
  }

  /**
   * 只检测一个
   * @param px
   * @param py
   */
  getHitNode(px, py, snode) {
    let _re = null;
    for (let [key, item] of this.nodeMap) {
      if (item !== snode) {
        if (NormalUtils.hitTestGlobal(px, py, item.view)) {
          _re = item;
          break;
        }
      }
    }
    return _re;
  }

  /**
   * 添加直线
   * @param node0
   * @param node1
   */
  addLine(node0, node1) {

    //两个节点不能多次链接
    if (this.lineMap.has(node0.id + "_" + node1.id) ||
      this.lineMap.has(node1.id + "_" + node0.id))
      return;

    //只能有一条链路
    let arr0 = node0.getLineArr2() ;
    if(arr0.length>0){
      for(let item of arr0){
        if(item.fromNode === node0){
          this.popMessage("当前模型不支持分支,请添加单条链路！") ;
          return ;
        }
      }
    }
    let arr1 = node1.getLineArr2() ;
    if(arr1.length>0){
      for(let item1 of arr1){
        if(item1.toNode === node1){
          this.popMessage("当前模型不支持分支,请添加单条链路！") ;
          return ;
        }
      }
    }
    if(this.lineMap.size>=this.nodeMap.size){
      this.popMessage("当前模型不支持分支,请添加单条链路！") ;
      return ;
    }
    let _line = new DrawLine(this, node0, node1);
    this.lineMap.set(_line.idl, _line);
    return _line;
  }

  /**
   * 删除线
   * @param line
   */
  removeLine(line, next = true) {
    let _idl = line.getIdl() ;
    if (!this.lineMap.has(_idl))
      return;
    this.lineMap.delete(_idl);
    line.clear();
    if (line.fromNode) {
      line.fromNode.removeLine(line);
      if (!next)
        this.removeNode(line.fromNode);
    }
    if (line.toNode) {
      line.toNode.removeLine(line);
      if (!next)
        this.removeNode(line.toNode);
    }
  }

  /**
   * 删除所有线
   * @param next
   */
  removeAllLines(next = false) {
    let lines = this.lineMap.values();
    if (this.lineMap.size > 0)
      this.removeLines(lines, next);
  }

  /**
   * 删除线
   * @param arr
   * @param next
   */
  removeLines(arr, next = true) {
    if (!arr)
      return;
    for (let line of arr) {
      this.removeLine(line, next);
    }
  }

  /**
   * 删除节点
   * @param arr
   */
  removeNodes(arr) {
    if (!arr)
      return;
    for (let line of arr) {
      this.removeNode(line, true);
    }
  }

  /**
   * 删除所有的节点
   */
  removeAllNodes() {
    let nodes = this.nodeMap.values();
    if (this.nodeMap.size > 0)
      this.removeNodes(nodes);
  }

  /**
   * 设置基本信息
   * @param form
   */
  setCreateData(form) {
    this.data.saveBase(form);
  }

  /**
   * 是否已经添加了某个类型的算子
   * @param type
   */
  hasTypeNode(type){
    let _nodes = Array.from(this.nodeMap.values());
    for(let node of _nodes){
      if(node.data.type === type){
        return true ;
      }
    }
    return false ;
  }

  /**
   * 已经存在某个算子
   * @param nid
   */
  hasIdNode(nid){
    let _nodes = Array.from(this.nodeMap.values());
    for(let node of _nodes){
      if(node.data.type === this.TYPE_OPERATOR && node.data.id===nid){
        return true ;
      }
    }
    return false ;
  }

  hasJqxxNode(){
    let _nodes = Array.from(this.nodeMap.values());
    for(let node of _nodes){
      if(node.data.type === this.TYPE_OPERATOR && node.data.pGroup===this.JQ_GROUP){
        return true ;
      }
    }
    return false ;
  }

  /**
   * 获得保存数据
   */
  getSaveData(valid=true) {
    let _nodes = Array.from(this.nodeMap.values());
    let _links =  Array.from(this.lineMap.values());
    if (valid){
      if(_nodes.length===0)
        return null ;

      //必须有一个输入  一个输出 一个机器学习 算法
      if(_nodes.length<3)
        return {error:"模型必须包含一个输入一个输出以及一个机器学习算法！"} ;
      if(_links.length !== (_nodes.length-1))
        return {error:"请正确建立节点关系！"} ;

      let map = {} ;
      for(let line of _links){
        if(map.hasOwnProperty(line.fromNode.idl+"_from") || map.hasOwnProperty(line.toNode.idl+"_to")){
          return {error:"当前只支持单链模型结构！"} ;
        }
        map[line.fromNode.idl+"_from"] = true;
        map[line.toNode.idl+"_to"] = true;
      }

    }

    //组装保存格式
    let saveData = this.data.getSaveData(_nodes, _links);

    //获得保存数据
    return saveData;
  }

  /**
   * 获得输入节点
   */
  getInputDatas(){
    let _arr = [] ;
    let _nodes = Array.from(this.nodeMap.values());
    for(let item of _nodes){
      if(item.data.type === "TableInput")
        _arr.push(item.data) ;
    }
    if(_arr.length>0)
      return _arr[0];
    return null ;
  }

  /**
   * 验证是否有重名
   */
  validSameName(arr){
    let len = arr.length ;
    if(len<2)
      return false ;
    for(let i=0;i<len;i++){
      for(let j=0;j<len;j++) {
        if(i!=j && arr[i].name === arr[j].name)
          return "节点名称'"+arr[i].name+"'重复出现！";
      }
    }
    return false ;
  }

  /**
   *
   */
  initStepView() {
    if(! this.stepView){
      this.stepView = $('<div class="temp-img0001" v-show="viewData."></div>');
      this.view.append(this.stepView);
    }
    this.refreshStepImg();
  }

  /**
   * 刷新背景图
   */
  refreshStepImg() {
    if (this.nodeMap.size > 0){
      this.stepView.hide();
      this.stepView.remove() ;
    }
    else{
      this.stepView.show();
    }
  }

  /**
   * 重置页面
   */
  reset(){
    this.removeAllNodes();
    this.removeAllLines();

    this.selectedNode = null;
    this.isDrawing = false;
    this.isDragging = false;

    if(this.nodeControl)
      this.nodeControl.reset() ;
  }

  /**
   * 清空当前视图
   */
  clear() {
    if (this.data)
      this.data.clear();
    this.removeAllNodes();
    this.removeAllLines();
  }
}
