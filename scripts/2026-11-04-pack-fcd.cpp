// Stream native SUMO FCD XML to compact 5-minute binary blocks, without retaining the day.
#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <cstring>
#include <cstdlib>
#include <cmath>
#include <cstdint>
#include <chrono>
struct Vehicle {uint32_t id;float x,z;uint16_t speed,angle;};
static_assert(sizeof(Vehicle)==16,"Unexpected record alignment");
struct Frame {int time;uint64_t offset;uint32_t count;};
struct Chunk {std::string file;std::vector<Frame> frames;};
const char* attr(const std::string&s,const char*key){auto p=s.find(key);if(p==std::string::npos)throw std::runtime_error(std::string("Missing ")+key);return s.c_str()+p+strlen(key);}
int main(int argc,char**argv){
 if(argc!=3)return 2;
 try{
 std::ios::sync_with_stdio(false);std::cin.tie(nullptr);
 std::vector<Vehicle> vehicles;vehicles.reserve(200000);std::vector<Chunk> chunks;
 std::ofstream out;std::string s;int time=0,block=-1,hour=-1;uint32_t maxcars=0;bool ended=false;
 auto start=std::chrono::steady_clock::now();
 while(std::getline(std::cin,s)){
  if(s.find("<timestep ")!=std::string::npos){time=std::lround(std::strtod(attr(s,"time=\""),nullptr));vehicles.clear();}
  else if(s.find("<vehicle ")!=std::string::npos){
   Vehicle v;v.id=std::strtoul(attr(s,"id=\"v"),nullptr,10);v.x=std::strtof(attr(s,"x=\""),nullptr);v.z=-std::strtof(attr(s,"y=\""),nullptr);v.speed=std::lround(std::strtod(attr(s,"speed=\""),nullptr)*100);v.angle=std::lround(std::strtod(attr(s,"angle=\""),nullptr)*100)%36000;vehicles.push_back(v);
  }else if(s.find("</timestep>")!=std::string::npos){
   if(block!=time/300){if(out.is_open())out.close();block=time/300;char filename[100];snprintf(filename,sizeof(filename),"2026-11-04-frames-%03d.bin",block);chunks.push_back({filename,{}});out.open(std::string(argv[1])+"/"+filename,std::ios::binary);if(!out)throw std::runtime_error("Cannot create chunk");}
   uint32_t count=vehicles.size(),t=time;uint64_t offset=out.tellp();out.write(reinterpret_cast<char*>(&t),4);out.write(reinterpret_cast<char*>(&count),4);out.write(reinterpret_cast<char*>(vehicles.data()),count*sizeof(Vehicle));chunks.back().frames.push_back({time,offset,count});if(count>maxcars)maxcars=count;
   if(time/3600!=hour){hour=time/3600;std::cerr<<argv[2]<<" hour "<<hour<<" active "<<count<<" wall "<<std::chrono::duration_cast<std::chrono::seconds>(std::chrono::steady_clock::now()-start).count()<<"s"<<std::endl;}
  }else if(s.find("</fcd-export>")!=std::string::npos)ended=true;
 }
 if(!ended)throw std::runtime_error("Incomplete FCD stream");if(out.is_open())out.close();
 std::ofstream index(std::string(argv[1])+"/2026-11-04-frame-index.json");
 index<<"{\"maxActive\":"<<maxcars<<",\"chunks\":[";
 for(size_t c=0;c<chunks.size();c++){if(c)index<<',';index<<"{\"file\":\""<<chunks[c].file<<"\",\"frames\":[";auto& fs=chunks[c].frames;for(size_t i=0;i<fs.size();i++){if(i)index<<',';index<<'['<<fs[i].time<<','<<fs[i].offset<<','<<fs[i].count<<']';}index<<"]}";}index<<"]}";
 }catch(const std::exception&e){std::cerr<<e.what()<<std::endl;return 1;}return 0;
}
