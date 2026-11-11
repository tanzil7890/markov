Pod::Spec.new do |s|
  s.name = 'MarkovGzipUtf8Codec'
  s.version = '0.0.1'
  s.summary = 'Bounded gunzip and strict UTF-8 decode'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Markov'
  s.homepage = 'https://markov.outhad.com'
  s.source = { :git => 'https://github.com/tanzil7890/markov.git' }
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.libraries = 'z'
  s.source_files = '**/*.swift'
end
